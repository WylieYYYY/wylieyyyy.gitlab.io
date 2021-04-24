'use strict';

const axios = require('axios');
const crypto = require('crypto');
const ejs = require('ejs');
const fs = require('fs');
const glob = require('glob');
const hljs = require('highlight.js');
const md = require('markdown-it');
const sharp = require('sharp');

(function main() {
  axios.get('https://gitlab.com/api/v4/users/wylieyyyy/projects?' +
      'order_by=path&sort=asc')
      .then((response) => {
        keyword.push(...response.data.map((x) => x.name));
        projectsResponse = response.data;
        pendingCount = response.data.length;
        checkLastDeployTime(response.data);
      })
      .catch(errorFunction('Cannot get projects.'));
  glob(__dirname + '/data/*.html.ejs', (error, matches) => {
    errorFunction()(error);
    for (const filepath of matches) {
      const htmlName = filepath.slice(__dirname.length + 6, -4);
      const args = {current: htmlName};
      switch (htmlName) {
        case 'blog.html':
          args['posts'] = parseBlogPosts();
          break;
        case 'demoinfo.html':
          args['content'] = parseMarkdownFile(__dirname + '/data/demoinfo.md');
          break;
        default:
          break;
      }
      ejs.renderFile(filepath, args, (error, html) => {
        errorFunction()(error);
        fs.writeFileSync(`${publicDir}/${htmlName}`, html);
        console.log(`Processed EJS for ${htmlName}.`);
      });
    }
  });
})();

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

const publicDir = __dirname + '/public';

let lastDeployAt = '';

const buildsComplex = {
  artifacts: [],
  badges: {},
  webp: {},
};
let projectsResponse;
let pendingCount;

/**
 * Composes a function that prints error message and end process if there is an
 * error occured.
 * @param {string|undefined} errorMessage - Optional message to be printed
 *  instead of the error.message property.
 * @return {function} A function that prints message and end process if errored.
 */
function errorFunction(errorMessage) {
  return (error) => {
    if (!error) return;
    const message = errorMessage || error.message;
    if (message) console.error(message);
    process.exitCode = 1;
  };
}

/** Called when all artifacts are fetched, fetches badges from README. */
function fetchBadges() {
  console.log('Prefetching all badges.');
  pendingCount = projectsResponse.length;
  for (const project of projectsResponse) {
    axios.get('https://gitlab.com/api/v4/projects/' + project.id +
        '/repository/files/README.md/raw?ref=master')
        .then((response) => {
          console.log(`Got badges for ${project.name}.`);
          buildsComplex.badges[project.id] = keyword.filter((value) => {
            // ignore word that starts with '-' as it may be a command flag
            const langRegex = new RegExp(`(^|[^a-z-])${value}([^a-z]|$)`, 'i');
            return langRegex.test(response.data) && value !== project.name;
          });
        })
        .catch((error) => {
          console.log(`No README for ${project.name}.`);
        })
        .finally(() => {
          if (--pendingCount === 0) optimizeImages();
        });
  }
}

/** Called after fetching badges. Downloads, resizes, and saves WebP files. */
function optimizeImages() {
  console.log('Prefetching and optimizing screenshots.');
  pendingCount = projectsResponse.length;
  const hash = crypto.createHash('sha256');
  for (const project of projectsResponse) {
    axios.get('https://gitlab.com/api/v4/projects/' +
        project.id + '/repository/tree')
        .then((response) => {
          const fileNames = response.data.map((x) => x.name).sort();
          const imagePaths = fileNames.filter((name) => {
            return /screenshot*/.test(name);
          });
          pendingCount += imagePaths.length;
          for (const imagePath of imagePaths) {
            axios({
              method: 'get',
              url: 'https://gitlab.com/api/v4/projects/' + project.id +
                  '/repository/files/' + imagePath + '/raw?ref=master',
              responseType: 'stream',
            })
                .then(async (response) => {
                  if (!buildsComplex.webp[imagePath]) {
                    const newDigest = hash.update(imagePath)
                      .copy().digest('hex').substring(0, 8);
                    buildsComplex.webp[imagePath] = newDigest;
                  }
                  const digest = buildsComplex.webp[imagePath];
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
                })
                .catch(errorFunction('Failed to fetch screenshot for ' +
                    `${project.name}.`))
                .finally(() => {
                  if (--pendingCount === 0) dumpFile();
                });
          }
        })
        .catch(errorFunction(`Failed to get tree for ${project.name}.`))
        .finally(() => {
          if (--pendingCount === 0) dumpFile();
        });
  }
}

/** Flushes all results to builds.json. **/
function dumpFile() {
  console.log('Dumping results to file.');
  fs.writeFileSync(publicDir + '/builds.json', JSON.stringify(buildsComplex));
}

/**
 * Downloads artifact zip and fetch badges if there is no more pending project.
 * @param {string} zipUrl - URL to downoad zip from.
 * @param {string} type - The artifact type name for logging.
 * @param {object} project - Project object for extracting name and id.
 */
function downloadArtifact(zipUrl, type, project) {
  axios({
    method: 'get',
    url: zipUrl,
    responseType: 'stream',
  })
      .then((response) => {
        response.data.pipe(fs.createWriteStream(publicDir + '/' +
            project.id + '.zip'));
        console.log(`Got ${type} artifact for ${project.name}.`);
        buildsComplex.artifacts.push(project.id);
      })
      .catch((error) => {
        console.log(`No ${type} artifact for ${project.name}.`);
      })
      .finally(() => {
        if (--pendingCount === 0) fetchBadges();
      });
}

/**
 * Checks for artifact in a successful master pipeline, update
 * builds.json and stores artifact.
 * @param {object} project - Project overview object returned by Gitlab API.
 */
function checkArtifact(project) {
  axios.get(`https://gitlab.com/api/v4/projects/${project.id}/pipelines`)
      .then((response) => {
        const masterPipelines = response.data.filter((pipeline) => {
          return pipeline.ref === 'master' && pipeline.status === 'success';
        });
        if (masterPipelines.length === 0) {
          console.log(`No pipelines found for ${project.name}, skipping.`);
          if (--pendingCount === 0) fetchBadges();
          return;
        }
        if (masterPipelines[0].updated_at < lastDeployAt) {
          downloadArtifact(`https://wylieyyyy.gitlab.io/${project.id}.zip`,
              'hosted', project);
        } else {
          downloadArtifact(`${project.web_url}/-/jobs/artifacts/master/` +
            'download?job=build', 'build', project);
        }
      })
      .catch(errorFunction(`Cannot get pipeline for ${project.name}.`));
}

/**
 * Checks whether any releases has been published, if not, use checkArtifact to
 * built version from pipeline.
 * @param {object} project - Project overview object returned by Gitlab API.
 */
function checkReleased(project) {
  axios.get(`https://gitlab.com/api/v4/projects/${project.id}/releases`)
      .then((response) => {
        if (response.data.length === 0) checkArtifact(project);
        else {
          console.log(project.name + ' has releases, skipping.');
          if (--pendingCount === 0) fetchBadges();
        }
      })
      .catch(errorFunction(`Cannot get release for ${project.name}.`));
}

/**
 * Checks when was the last deployment. And sets lastDeployAt to that time.
 * @param {object} projects - Array of projects overview object returned by
 *     Gitlab API.
 */
function checkLastDeployTime(projects) {
  const project = projects.find((project) => {
    return project.path === 'wylieyyyy.gitlab.io';
  });
  if (project === undefined) {
    console.log('No prior deployment, starting from scratch.');
    for (const project of projects) checkReleased(project);
    return;
  }
  axios.get(`https://gitlab.com/api/v4/projects/${project.id}/pipelines`)
      .then((response) => {
        const masterPipelines = response.data.filter((pipeline) => {
          return pipeline.ref === 'master' && pipeline.status === 'success';
        });
        if (masterPipelines.length === 0) {
          console.log('No prior successful deployment, starting from scratch.');
        } else {
          lastDeployAt = masterPipelines[0].updated_at;
          console.log(`Last deployment was at ${lastDeployAt}.`);
        }
        for (const project of projects) checkReleased(project);
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
  parser.renderer.rules['heading_open'] = (tokens, idx, options, env, slf) => {
    const token = tokens[idx];
    if (idx == 0 && token.tag === 'h1') {
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
