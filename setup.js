'use strict';

const axios = require('axios');
const fs = require('fs');

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

const builds = new Set();
let lastDeployAt = '';

const buildsComplex = {
  artifacts: [],
  badges: {},
};
let projectsResponse;
let pendingCount;

/** Called when all artifacts are fetched,  */
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
          if (--pendingCount === 0) dumpFile();
        })
        .catch((error) => {
          console.log(`No README for ${project.name}.`);
          if (--pendingCount === 0) dumpFile();
        });
  }
}

/** Flushes all results to builds.json. **/
function dumpFile() {
  buildsComplex.artifacts = [...builds];
  console.log('Dumping results to file.');
  fs.writeFileSync(publicDir + '/builds.json', JSON.stringify(buildsComplex));
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
          axios({
            method: 'get',
            url: 'https://wylieyyyy.gitlab.io/' + project.id + '.zip',
            responseType: 'stream',
          })
              .then((response) => {
                response.data.pipe(fs.createWriteStream(publicDir + '/' +
                    project.id + '.zip'));
                console.log('Got hosted artifact for ' + project.name + '.');
                builds.add(project.id);
                if (--pendingCount === 0) fetchBadges();
              })
              .catch((error) => {
                console.log(`No hosted build artifact for ${project.name}.`);
                if (--pendingCount === 0) fetchBadges();
              });
          return;
        }
        axios({
          method: 'get',
          url: project.web_url + '/-/jobs/artifacts/master/download?job=build',
          responseType: 'stream',
        })
            .then((response) => {
              response.data.pipe(fs.createWriteStream(publicDir + '/' +
                  project.id + '.zip'));
              console.log(`Got build artifact for ${project.name}.`);
              builds.add(project.id);
              if (--pendingCount === 0) fetchBadges();
            })
            .catch((error) => {
              console.log(`No build artifact for ${project.name}.`);
              if (--pendingCount === 0) fetchBadges();
            });
      })
      .catch((error) => {
        console.error(`Cannot get pipeline for ${project.name}.`);
        process.exitCode = 1;
      });
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
      .catch((error) => {
        console.error(`Cannot get release for ${project.name}.`);
        process.exitCode = 1;
      });
}

/**
 * Checks when was the last deployment. And sets lastDeployAt to that time.
 * @param {object} projects - Array of projects overview object returned by
 *     Gitlab API.
 */
function checkLastDeployTime(projects) {
  const project = projects.filter((project) => {
    return project.path === 'wylieyyyy.gitlab.io';
  })[0];
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
          console.log('Last deployment was at ' +
              masterPipelines[0].updated_at + '.');
          lastDeployAt = masterPipelines[0].updated_at;
        }
        for (const project of projects) checkReleased(project);
      })
      .catch((error) => {
        console.error('Cannot get deployment pipelines.');
        process.exitCode = 1;
      });
}

axios.get('https://gitlab.com/api/v4/users/wylieyyyy/projects?' +
    'order_by=path&sort=asc')
    .then((response) => {
      keyword.push(...response.data.map((x) => x.name));
      projectsResponse = response.data;
      pendingCount = response.data.length;
      checkLastDeployTime(response.data);
    })
    .catch((error) => {
      console.error('Cannot get projects.');
      process.exitCode = 1;
    });
