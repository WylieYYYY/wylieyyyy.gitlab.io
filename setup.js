'use strict';

const axios = require('axios');
const fs = require('fs');

const publicDir = __dirname + '/public';

const builds = function() {
  if (fs.existsSync(publicDir + '/builds.json')) {
    return new Set(JSON.parse(
        fs.readFileSync(publicDir + '/builds.json')));
  }
  return new Set();
}();

let lastDeployAt = '';

/**
 * Checks for artifact in a successful master pipeline, update
 * builds.json and stores artifact.
 * @param {object} project - Project overview object returned by Gitlab API.
 */
function checkArtifact(project) {
  axios.get('https://gitlab.com/api/v4/projects/' + project.id + '/pipelines')
      .then((response) => {
        const masterPipelines = response.data.filter((pipeline) => {
          return pipeline.ref === 'master' && pipeline.status === 'success';
        });
        if (masterPipelines.length === 0) {
          console.log('No pipelines found for ' + project.name + ', skipping.');
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
                fs.writeFileSync(publicDir + '/builds.json',
                    JSON.stringify([...builds.add(project.id)]));
              })
              .catch((error) => {
                console.log('No hosted build artifact for ' +
                    project.name + '.');
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
              console.log('Got build artifact for ' + project.name + '.');
              fs.writeFileSync(publicDir + '/builds.json',
                  JSON.stringify([...builds.add(project.id)]));
            })
            .catch((error) => {
              console.log('No build artifact for ' + project.name + '.');
            });
      })
      .catch((error) => {
        console.error('Cannot get pipeline for ' + project.name + '.');
        process.exitCode = 1;
      });
}

/**
 * Checks whether any releases has been published, if not, use checkArtifact to
 * built version from pipeline.
 * @param {object} project - Project overview object returned by Gitlab API.
 */
function checkReleased(project) {
  axios.get('https://gitlab.com/api/v4/projects/' + project.id + '/releases')
      .then((response) => {
        if (response.data.length === 0) checkArtifact(project);
        else console.log(project.name + ' has releases, skipping.');
      })
      .catch((error) => {
        console.error('Cannot get release for ' + project.name + '.');
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
  axios.get('https://gitlab.com/api/v4/projects/' + project.id + '/pipelines')
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
      checkLastDeployTime(response.data);
    })
    .catch((error) => {
      console.error('Cannot get projects.');
      process.exitCode = 1;
    });
