'use strict';

const axios = require('axios');
const CleanCSS = require('clean-css');
const crypto = require('crypto');
const dirTree = require('directory-tree');
const ejs = require('ejs');
const fs = require('fs');
const glob = require('glob');
const hljs = require('highlight.js');
const htmlMinify = require('html-minifier').minify;
const md = require('markdown-it');
const {PurgeCSS} = require('purgecss');
const sass = require('sass');
const sharp = require('sharp');
const uglify = require('uglify-js');

const publicDir = __dirname + '/public';
const projectEndPoint = 'https://gitlab.com/api/v4/projects';
const htmlMinifyConfig = {
  removeComments: true,
  removeCommentsFromCDATA: true,
  removeCDATASectionsFromCDATA: true,
  collapseWhitespace: true,
  collapseBooleanAttributes: true,
  removeAttributeQuotes: true,
  removeRedundantAttributes: true,
  useShortDoctype: true,
  removeEmptyAttributes: true,
  removeEmptyElements: false,
  removeOptionalTags: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  minifyJS: true,
  minifyCSS: true,
};

(async function main() {
  hljs.unregisterLanguage('markdown');
  hljs.registerLanguage('markdown', require('./data/components/markdown.hljs'));
  try {
    await axios.get('https://gitlab.com/api/v4/users/wylieyyyy/projects?' +
        'order_by=path&sort=asc')
        .then(async (response) => {
          keyword.push(...response.data.map((x) => x.name));
          const lastDeployAt = await getLastDeployTime(response.data);
          projectSpecificTasks(response.data, lastDeployAt);
        })
        .catch(errorFunction('Cannot get projects.'));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const codedumpPath = __dirname + '/data/pages/codedump/';
  glob(codedumpPath + '**/*', (error, matches) => {
    errorFunction()(error);
    for (const filepath of matches) {
      if (fs.statSync(filepath).isDirectory()) continue;
      const filename = filepath.slice(codedumpPath.length);
      const dirpath = filename.slice(0, -filename.split('/').pop().length);
      if (!fs.existsSync(`${publicDir}/codedump/${dirpath}`)) {
        fs.mkdirSync(`${publicDir}/codedump/${dirpath}`, {recursive: true});
      }
      fs.copyFileSync(filepath, `${publicDir}/codedump/${filename}`);
      fs.readFile(filepath, 'utf-8', (error, data) => {
        errorFunction()(error);
        const lang = filepath.split('/').pop().split('.')[1];
        const args = {
          filepath: filename,
          content: hljs.highlight(data, {language: lang}).value,
        };
        const editorTemplatePath = __dirname + '/data/components/editor.ejs';
        ejs.renderFile(editorTemplatePath, args, (error, html) => {
          errorFunction()(error);
          fs.writeFileSync(`${publicDir}/codedump/${filename}.html`,
              htmlMinify(html, htmlMinifyConfig));
          console.log(`Processed ${filename} from CodeDump.`);
        });
      });
    }
  });
  glob(__dirname + '/data/pages/**/*.js', (error, matches) => {
    errorFunction()(error);
    for (const filepath of matches) {
      fs.readFile(filepath, 'utf-8', (error, data) => {
        errorFunction()(error);
        const filename = filepath.slice(__dirname.length + 12);
        fs.writeFileSync(`${publicDir}/${filename}`, uglify.minify(data).code);
        console.log(`Processed ${filename}.`);
      });
    }
  });
  glob(__dirname + '/data/pages/**/*.html.ejs', (error, matches) => {
    errorFunction()(error);
    for (const filepath of matches) {
      const htmlName = filepath.slice(__dirname.length + 12, -4);
      const args = {current: htmlName};
      switch (htmlName) {
        case 'blog.html':
          args['posts'] = parseBlogPosts();
          break;
        case 'demoinfo.html':
          args['content'] = parseMarkdownFile(__dirname +
            '/data/pages/demoinfo.md');
          break;
        case 'codedump/index.html':
          args['tree'] = dirTree(codedumpPath, {
            attributes: ['extension', 'type'],
          });
          args['tree']['expanded'] = true;
          args['prefixLength'] = codedumpPath.length;
          break;
        default:
          break;
      }
      ejs.renderFile(filepath, args, (error, html) => {
        errorFunction()(error);
        fs.writeFileSync(`${publicDir}/${htmlName}`,
            htmlMinify(html, htmlMinifyConfig));
        console.log(`Processed EJS for ${htmlName}.`);
      });
    }
  });
  glob(__dirname + '/data/[^_]*.scss', async (error, matches) => {
    errorFunction()(error);
    for (const filepath of matches) {
      const filename = filepath.slice(__dirname.length + 6);
      const mainStylePurgeRules = {
        content: [__dirname + '/data/**/*.ejs'],
        safelist: [/^dropdown-(toggle|menu|item)$/, 'btn-success'],
      };
      const compiled = (await new PurgeCSS().purge({
        css: [{raw: sass.compile(filepath).css}],
        variables: true,
        ...(filename === 'styles.scss'? mainStylePurgeRules : {}),
      }))[0].css;
      const minified = new CleanCSS({level: {
        ...(filename === 'styles.scss'? {} : {1: {specialComments: 0}}),
        2: {all: true},
      }}).minify(compiled);
      if (minified.errors.length > 0) errorFunction()(minified.errors[0]);
      fs.writeFileSync(`${publicDir}/styles/${filename.slice(0, -5)}.css`,
          minified.styles);
      console.log(`Processed SASS for ${filename}.`);
    }
  });
})();

/**
 * Gets project artifacts and constructs builds.json.
 * @param {object} projects - Array of project overview objects returned by
 *  Gitlab API.
 * @param {string} lastDeployAt - ISO timestamp of last deployment, to check
 *  where to pull the artifact from.
 */
async function projectSpecificTasks(projects, lastDeployAt) {
  const artifactIds = [];
  for (const project of projects) {
    artifactIds.push((async () => {
      if (await checkReleased(project)) return null;
      return checkAndGetArtifact(project, lastDeployAt);
    })());
  }
  const fetches = await Promise.all([
    promiseAllNonNull(artifactIds),
    fetchBadges(projects),
    optimizeImages(projects),
  ]);
  await dumpFile({
    artifacts: fetches[0],
    badges: fetches[1],
    webp: fetches[2],
  });
}

const keyword = [
  '.NET Core',
  'Apache',
  'API',
  'C',
  'CSharp',
  'CSV',
  'GTK',
  'JSON',
  'Legacy',
  'PHP',
  'Python',
  'Shell',
  'SQLite',
  'VTE',
  'XML',
];

/**
 * Composes a function that throws an error with message when called with a
 * valid error.
 * @param {string|undefined} errorMessage - Optional message to be printed
 *  instead of the error.message property.
 * @return {function} A function that throws an error with the message.
 */
function errorFunction(errorMessage) {
  return (error) => {
    if (!error) return;
    const message = errorMessage || error.message;
    throw new Error(message);
  };
}

/**
 * Wait for an array of promises to resolve, and filter out nulls.
 * @param {Promise<T|null>[]} promises - The array of promises
 *  to be waited for.
 * @return {Promise<T[]>} Promised array with nulls removed.
 * @template T
 */
async function promiseAllNonNull(promises) {
  return (await Promise.all(promises)).filter((value) => value !== null);
}

/**
 * Called when all artifacts are fetched, fetches badges from README.
 * @param {object} projects - Array of project overview objects returned by
 *  Gitlab API.
 * @return {Promise<object>} Project ID to badge keywords object.
 */
async function fetchBadges(projects) {
  console.log('Prefetching all badges.');
  const pendingBadgeFetches = [];
  for (const project of projects) {
    pendingBadgeFetches.push(axios.get(projectEndPoint + '/' + project.id +
        '/repository/files/README.md/raw?ref=master')
        .then((response) => {
          console.log(`Got badges for ${project.name}.`);
          return [project.id, keyword.filter((value) => {
            // ignore word that starts with '-' as it may be a command flag
            const langRegex = new RegExp(`(^|[^a-z-])${value}([^a-z]|$)`, 'i');
            return langRegex.test(response.data) && value !== project.name;
          })];
        })
        .catch((error) => {
          console.log(`No README for ${project.name}.`);
          return null;
        }));
  }
  return Object.fromEntries(await promiseAllNonNull(pendingBadgeFetches));
}

/**
 * Downloads, resizes, and saves WebP files.
 * @param {object} projects - Array of project overview objects returned by
 *  Gitlab API.
 * @return {Promise<object>} "projectId-imagePath" to hash object for
 *  prefetched image lookup.
*/
async function optimizeImages(projects) {
  console.log('Prefetching and optimizing screenshots.');
  const hash = crypto.createHash('sha256');
  const pendingProjectFetches = [];
  for (const project of projects) {
    pendingProjectFetches.push(axios.get(`${projectEndPoint}/` +
        `${project.id}/repository/tree`)
        .then((response) => {
          const fileNames = response.data.map((x) => x.name).sort();
          const imagePaths = fileNames.filter((name) => {
            return /screenshot*/.test(name);
          });
          const pendingScreenshotFetches = [];
          for (const imagePath of imagePaths) {
            pendingScreenshotFetches.push(axios({
              method: 'get',
              url: projectEndPoint + '/' + project.id +
                  '/repository/files/' + imagePath + '/raw?ref=master',
              responseType: 'stream',
            })
                .then(async (response) => {
                  const digest = hash.update(imagePath)
                      .copy().digest('hex').substring(0, 8);
                  const webPPrefix = publicDir +
                      `/styles/webp/${project.id}-${digest}`;
                  const stream = response.data
                      .pipe(sharp().webp())
                      .pipe(fs.createWriteStream(webPPrefix + '.webp'));
                  await new Promise((fulfill) => stream.on('finish', fulfill));
                  console.log(`Got screenshot ${digest} for ${project.name}.`);
                  if (imagePaths[0] === imagePath) {
                    sharp(webPPrefix + '.webp')
                        .resize(512, 384, {fit: 'outside'})
                        .resize(512, 384, {fit: 'cover'})
                        .toFile(webPPrefix + '-card.webp');
                    console.log(`Converted screenshot ${digest} to card.`);
                  }
                  return [`${project.id}-${imagePath}`, digest];
                })
                .catch(errorFunction('Failed to fetch screenshot for ' +
                    `${project.name}.`)));
          }
          return Promise.all(pendingScreenshotFetches);
        })
        .catch(errorFunction(`Failed to get tree for ${project.name}.`)));
  }
  return Object.fromEntries((await Promise.all(pendingProjectFetches)).flat());
}

/**
 * Dump object to builds.json.
 * @param {object} dumpObj - The object to be converted to JSON string and
 *  dump to builds.json.
 */
async function dumpFile(dumpObj) {
  console.log('Dumping results to file.');
  await fs.promises.writeFile(publicDir + '/builds.json',
      JSON.stringify(dumpObj));
}

/**
 * Downloads artifact zip.
 * @param {string} zipUrl - URL to downoad zip from.
 * @param {string} type - The artifact type name for logging.
 * @param {object} project - Project object for extracting name and id.
 * @return {Promise<number|null>} The project ID if an artifact is got,
 *  null otherwise (no artifact in pipeline).
 */
async function downloadArtifact(zipUrl, type, project) {
  return axios({
    method: 'get',
    url: zipUrl,
    responseType: 'stream',
  })
      .then((response) => {
        response.data.pipe(fs.createWriteStream(publicDir + '/' +
            project.id + '.zip'));
        console.log(`Got ${type} artifact for ${project.name}.`);
        return project.id;
      })
      .catch((error) => {
        console.log(`No ${type} artifact for ${project.name}.`);
        return null;
      });
}

/**
 * Checks for artifact in a successful master pipeline, update
 * builds.json and stores artifact.
 * @param {object} project - Project overview object returned by Gitlab API.
 * @param {string} lastDeployAt - ISO timestamp of last deployment, to check
 *  where to pull the artifact from.
 * @return {Promise<number|null>} The project ID if an artifact is got,
 *  null otherwise (no artifact in pipeline / no pipeline).
 */
async function checkAndGetArtifact(project, lastDeployAt) {
  return axios.get(`${projectEndPoint}/${project.id}/pipelines`)
      .then((response) => {
        const masterPipelines = response.data.filter((pipeline) => {
          return pipeline.ref === 'master' && pipeline.status === 'success';
        });
        if (masterPipelines.length === 0) {
          console.log(`No pipelines found for ${project.name}, skipping.`);
          return null;
        }
        if (masterPipelines[0].updated_at < lastDeployAt) {
          return downloadArtifact('https://wylieyyyy.gitlab.io/' +
              `${project.id}.zip`, 'hosted', project);
        } else {
          return downloadArtifact(`${project.web_url}/-/jobs/` +
            'artifacts/master/download?job=build', 'build', project);
        }
      })
      .catch(errorFunction(`Cannot get pipeline for ${project.name}.`));
}

/**
 * Checks whether any releases has been published for the project.
 * @param {object} project - Project overview object returned by Gitlab API.
 * @return {Promise<boolean>} Whether the project has releases.
 */
async function checkReleased(project) {
  return axios.get(`${projectEndPoint}/${project.id}/releases`)
      .then((response) => {
        if (response.data.length === 0) return false;
        else {
          console.log(project.name + ' has releases, skipping.');
          return true;
        }
      })
      .catch(errorFunction(`Cannot get release for ${project.name}.`));
}

/**
 * Get the last deployment time as ISO timestamp.
 * @param {object} projects - Array of project overview objects returned by
 *  Gitlab API.
 * @return {Promise<string>} The ISO timestamp of the last deployment
 *  time if exists, empty string otherwise.
 */
async function getLastDeployTime(projects) {
  const project = projects.find((project) => {
    return project.path === 'wylieyyyy.gitlab.io';
  });
  if (project === undefined) {
    console.log('No prior deployment, starting from scratch.');
    return '';
  }
  return axios.get(`${projectEndPoint}/${project.id}/pipelines`)
      .then(async (response) => {
        const masterPipelines = response.data.filter((pipeline) => {
          return pipeline.ref === 'master' && pipeline.status === 'success';
        });
        if (masterPipelines.length === 0) {
          console.log('No prior successful deployment, starting from scratch.');
          return '';
        }
        const lastDeployAt = masterPipelines[0].updated_at;
        console.log(`Last deployment was at ${lastDeployAt}.`);
        return lastDeployAt;
      })
      .catch(errorFunction('Cannot get deployment pipelines.'));
}

/**
 * Parse markdown blog posts to an object array with attributes and HTML.
 * @return {Array} Array of objects reprenting posts.
 */
function parseBlogPosts() {
  const posts = [];
  let postTitle = 'Untitled';
  let inTitleHeading = false;
  const parser = md({
    highlight: (str, lang) => {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(str, {language: lang}).value;
        } catch (error) {
          console.error(error.message);
        }
      }
      return '';
    },
  }).use(require('markdown-it-imsize'));
  const fenceDefaultRule = parser.renderer.rules['fence'];
  parser.renderer.rules['fence'] = (...ruleArguments) => {
    const htmlFence = fenceDefaultRule(...ruleArguments);
    return '<pre style="overflow-x: auto;"' + htmlFence.slice(4);
  };
  parser.renderer.rules['heading_open'] = (tokens, idx, options, env, slf) => {
    if (idx == 0 && tokens[idx].tag === 'h1') {
      inTitleHeading = true;
      tokens[idx + 1].type = 'io.gitlab.wylieyyyy.post_title';
      return '';
    }
    return slf.renderToken(tokens, idx, options);
  };
  parser.renderer.rules['io.gitlab.wylieyyyy.post_title'] = (
      tokens, idx, options, env, slf,
  ) => {
    postTitle = tokens[idx].content;
    return '';
  };
  parser.renderer.rules['heading_close'] = (tokens, idx, options, env, slf) => {
    const token = tokens[idx];
    if (token.tag === 'h1' && inTitleHeading) {
      inTitleHeading = false;
      return '';
    }
    return slf.renderToken(tokens, idx, options);
  };
  try {
    const matches = glob.sync(__dirname + '/data/posts/*.md').sort().reverse();
    for (const filepath of matches) {
      postTitle = 'Untitled';
      const post = {
        subtitle: filepath.slice(__dirname.length + 12, -3),
      };
      post.content = parseMarkdownFile(filepath, parser);
      post.title = postTitle;
      posts.push(post);
      console.log(`Processed post ${post.subtitle}.`);
    }
  } catch (error) {
    errorFunction()(error);
  }
  return posts;
}

/**
 * Parses a markdown file to an HTML string.
 * @param {string} filepath - Path to the markdown file.
 * @param {object|undefined} parser - Optional parser to be used.
 * @return {string} An HTML string representation of the file content.
 */
function parseMarkdownFile(filepath, parser) {
  console.log('Processed markdown for ' +
      filepath.split('/').pop().slice(0, -3));
  if (!parser) parser = md();
  try {
    const markdown = fs.readFileSync(filepath, 'utf8');
    return parser.render(markdown);
  } catch (error) {
    errorFunction()(error);
  }
}
