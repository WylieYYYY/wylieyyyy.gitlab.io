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
        axios({
          method: 'get',
          url: project.web_url +
              '/-/jobs/artifacts/master/download?job=build',
          responseType: 'stream',
        })
            .then((response) => {
              response.data.pipe(fs.createWriteStream(publicDir + '/' +
                  project.id + '.zip'));
              console.log('Got artifact for ' + project.name + '.');
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
 * Checks wether any releases has been published, if not, use checkArtifact to
 * built version from pipeline.
 * @param {object} project - Project overview object returned by Gitlab API.
 */
function checkReleased(project) {
  axios.get('https://gitlab.com/api/v4/projects/' + project.id + '/releases')
      .then((response) => {
        if (response.data.length === 0) checkArtifact(project, builds);
        else console.log(project.name + ' has releases, skipping.');
      })
      .catch((error) => {
        console.error('Cannot get release for ' + project.name + '.');
        process.exitCode = 1;
      });
}

axios.get('https://gitlab.com/api/v4/users/wylieyyyy/projects?' +
    'order_by=path&sort=asc')
    .then((response) => {
      for (const project of response.data) checkReleased(project);
    })
    .catch((error) => {
      console.error('Cannot get projects.');
      process.exitCode = 1;
    });
