/* exported vm */
/* global axios, Vue */
'use strict';

Vue.component('drop-menu', {
  props: ['type', 'title', 'items', 'closeTrigger'],
  data: function() {
    return {
      opened: false,
    };
  },
  watch: {
    closeTrigger: function() {
      this.opened = false;
    },
  },
  template: '#drop-menu-template',
});

const vm = new Vue({
  el: '#app',
  data: {
    buildDetails: null,
    badges: {},
    response: null,
    screenshot: {},
    readMe: {},
    version: {},
    latestCreated: {},
    license: {},
    licenseBody: {},
    projectHasDemo: {},
    modal: {
      title: null,
      dropDown: null,
      body: null,
    },
    dropDownTrigger: false,
    downloadLinks: {},
    errors: [],
  },
  computed: {
    /**
     * Fetches the script for markdown parser lazily.
     * @return {object} The markdown parser.
     */
    md: async function() {
      return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/' +
            'markdown-it/dist/markdown-it.min.js';
        script.onload = () => resolve(window.markdownit());
        document.head.appendChild(script);
      });
    },
    /**
     * Calculates background color and font variant for badges based on hash.
     * @return {object} Map of valid CSS string with keywords as keys.
     */
    badgeStyles: function() {
      const badgeStyles = {};
      const keyword = Object.values(this.badges).flat();
      for (let i = 0; i < keyword.length; i++) {
        const value = keyword[i];
        let hash = 2166136261;
        for (let i = 0; i < value.length; i++) {
          hash ^= value.charCodeAt(i);
          hash *= 16777619;
          hash |= 0;
        }
        const colorMean = ((hash & 0xff) * 1.1 + (hash >> 8 & 0xff) * 1.4 +
            (hash >> 16 & 0xff) * 0.8) / 3;
        if (colorMean > 127) hash = ~hash;
        badgeStyles[value] = 'background-color: rgb(' +
            `${(hash & 0xff) * 0.7 | 0},` +
            `${(hash >> 8 & 0xff) * 0.5 | 0},` +
            `${(hash >> 16 & 0xff) * 0.9 | 0});`;
        if (value === value.toUpperCase()) {
          badgeStyles[value] += ' font-variant: small-caps;';
        }
      }
      return badgeStyles;
    },
  },
  methods: {
    /**
     * If str is all capital, returns str decapitalized, else returns str.
     * @param {string} str - String to be checked.
     * @return {string} Non all-capitalized version of str.
     */
    removeAllCaps: function(str) {
      if (str === str.toUpperCase()) return str.toLowerCase();
      return str;
    },
    /**
     * Shows project's README in the modal box.
     * @param {number} id - ID of the project.
     */
    showDetailModal: function(id) {
      Vue.set(this.modal, 'title', 'Details');
      if (this.downloadLinks[id] !== undefined) {
        Vue.set(this.modal, 'dropDown', this.downloadLinks[id]);
      }
      if (typeof this.readMe[id] === 'string') {
        Vue.set(this.modal, 'body', this.readMe[id]);
        return;
      }
      axios.get('https://gitlab.com/api/v4/projects/' + id +
          '/repository/files/README.md/raw?ref=master')
          .then(async (response) => {
            if (this.buildDetails) {
              for (const screenshotId of Object.keys(this.buildDetails.webp)) {
                const idMatch = screenshotId.match(/(.*?)-(.*)/);
                if (!idMatch || idMatch[1] !== id.toString()) continue;
                response.data = response.data.replace(
                    new RegExp(`(\\[.*?]\\()(${idMatch[2]})( .*?\\))`, 'g'),
                    `$1${document.location.origin}/styles/webp/` +
                    `${id}-${this.buildDetails.webp[screenshotId]}.webp$3`);
              }
            }
            this.readMe[id] = (await this.md).render(response.data
                .replace(/(\[.*?]\()(?!https?:\/\/)(.*?)( .*?\))/g,
                    '$1https://gitlab.com/api/v4/projects/' + id +
                    '/repository/files/$2/raw?ref=master$3'))
                .replace(/(<img)(.*?>)/g,
                    '$1 style="max-width: 25rem; height: auto;" $2');
            Vue.set(this.modal, 'body', this.readMe[id]);
          })
          .catch((error) => {
            vm.errors = vm.errors.concat('Failed to fetch README' +
                ` for project ${id}.`);
          });
    },
    /**
     * Requests and shows project's license in the modal box.
     * @param {number} id - ID of the project.
     */
    showLicenseModal: function(id) {
      if (this.license[id] === 'Unlicensed') return;
      Vue.set(this.modal, 'title', 'License');
      if (this.licenseBody[id] !== undefined) {
        Vue.set(this.modal, 'body', this.licenseBody[id]);
        return;
      }
      axios.get('https://gitlab.com/api/v4/projects/' + id +
          '/repository/files/LICENSE/raw?ref=master')
          .then((response) => {
            // add code block and linebreaks, making it more readable
            this.licenseBody[id] = '<code>' + response.data
                .replace(/\n\n/g, '<br/><br/>') + '</code>';
            Vue.set(this.modal, 'body', this.licenseBody[id]);
          })
          .catch((error) => {
            vm.errors = vm.errors.concat('Failed to fetch license' +
                ` for project ${id}.`);
          });
    },
    /** Resets attributes of modal box, also hides it. */
    hideModal: function() {
      Vue.set(this.modal, 'title', null);
      this.modal.dropDown = null;
      this.modal.body = null;
    },
  },
  created: function() {
    /**
     * Requests and set first screenshot of each project,
     * set to placeholder if none.
     * @param {object} vm - The Vue instance.
     * @param {object} project - Project overview object returned by Gitlab API.
     * @param {object} builds - JSON object of build details if fetched.
     */
    function updateScreenshots(vm, project, builds) {
      axios.get('https://gitlab.com/api/v4/projects/' +
          project.id + '/repository/tree')
          .then((response) => {
            const fileNames = response.data.map((x) => x.name).sort();
            const imagePath = fileNames.filter((name) => {
              return /screenshot*/.test(name);
            })[0];
            if (imagePath !== undefined) {
              if (builds && builds.webp[`${project.id}-${imagePath}`]) {
                Vue.set(vm.screenshot, project.id, `styles/webp/${project.id}` +
                    `-${builds.webp[`${project.id}-${imagePath}`]}-card.webp`);
              } else {
                Vue.set(vm.screenshot, project.id,
                    'https://gitlab.com/api/v4/projects/' + project.id +
                    '/repository/files/' + imagePath + '/raw?ref=master');
              }
            } else {
              Vue.set(vm.screenshot, project.id, 'styles/no-screenshot.webp');
            }
          })
          .catch((error) => {
            vm.errors = vm.errors.concat('Failed to fetch screenshot' +
                ` for ${project.name}.`);
          });
    }
    /**
     * Requests latest release or commit version,
     * update releases' dropup on the way.
     * @param {object} vm - The Vue instance.
     * @param {object} project - Project overview object returned by Gitlab API.
     * @return {object} A promise that returns true if there are no releases.
     */
    function updateVersions(vm, project) {
      return axios.get('https://gitlab.com/api/v4/projects/' + project.id +
          '/releases')
          .then((response) => {
            if (response.data.length === 0) {
              axios.get('https://gitlab.com/api/v4/projects/' + project.id +
                  '/repository/branches/master')
                  .then((response) => {
                    Vue.set(vm.version, project.id,
                        response.data.commit.short_id);
                    Vue.set(vm.latestCreated, project.id,
                        response.data.commit.created_at);
                  })
                  .catch((error) => {
                    vm.errors = vm.errors.concat('Failed to fetch commits' +
                        ` for ${project.name}.`);
                  });
            } else {
              Vue.set(vm.version, project.id, response.data[0].tag_name);
              Vue.set(vm.latestCreated, project.id,
                  response.data[0].created_at);
              const packageMap = {};
              response.data.slice(0, 6).forEach((release) => {
                packageMap[release.tag_name] = undefined;
              });
              response.data.slice(0, 6).forEach((release) => {
                axios.get('https://gitlab.com/api/v4/projects/' + project.id +
                    '/releases/' + release.tag_name + '/assets/links')
                    .then((response) => {
                      const pack = response.data.find((asset) => {
                        return asset.link_type === 'package';
                      });
                      packageMap[release.tag_name] = pack.url;
                      if (Object.values(packageMap)
                          .indexOf(undefined) === -1) {
                        Vue.set(vm.downloadLinks, project.id, [
                          'Download Release',
                          Object.keys(packageMap).map((tagName) => {
                            const format = packageMap[tagName]
                                .match(/.*\/.*?(\..*)/)[1];
                            return {
                              href: packageMap[tagName],
                              name: tagName + ' (' + format + ')',
                            };
                          }).filter((x) => x !== undefined),
                        ]);
                        showHashProjectDetail(vm, project);
                      }
                    })
                    .catch((error) => {
                      vm.errors = vm.errors.concat('Failed to fetch package' +
                          ` for ${project.name}.`);
                    });
              });
            }
            return response.data.length === 0;
          })
          .catch((error) => {
            vm.errors = vm.errors.concat('Failed to fetch release detail' +
                ` for ${project.name}.`);
          });
    }
    /**
     * Requests license name for each project.
     * @param {object} vm - The Vue instance.
     * @param {object} project - Project overview object returned by Gitlab API.
     */
    function updateLicense(vm, project) {
      axios.get('https://gitlab.com/api/v4/projects/' + project.id +
          '?license=true')
          .then((response) => {
            Vue.set(vm.license, project.id, response.data.license.nickname ||
                response.data.license.name);
          })
          .catch((error) => {
            Vue.set(vm.license, project.id, 'Unlicensed');
          });
    }
    /**
     * Show detail if the given project is in the hash.
     * @param {object} vm - The Vue instance.
     * @param {object} project - Project overview object returned by Gitlab API.
     */
    function showHashProjectDetail(vm, project) {
      if (project.path === window.location.hash.substring(1) &&
          vm.readMe[project.id]) {
        vm.showDetailModal(project.id);
      }
    }
    /**
     * Check pre-downloaded job builds, and set links if there are any.
     * @param {object} vm - The Vue instance.
     * @param {object} projects - Array of projects overview object returned by
     *     Gitlab API.
     * @param {object} builds - JSON object of build details.
     */
    function updateJobBuild(vm, projects, builds) {
      vm.badges = builds.badges;
      for (const project of projects) {
        updateVersions(vm, project).then((hasNoReleases) => {
          if (builds.artifacts.indexOf(project.id) === -1) {
            if (hasNoReleases) {
              Vue.set(vm.downloadLinks, project.id, ['Download Source',
                ['.zip', '.tar.gz', '.tar.bz2', '.tar']
                    .map((format) => {
                      return {
                        href: `${project.web_url}/-/archive/master/` +
                            `${project.path}-master${format}`,
                        name: 'Master (' + format + ')',
                      };
                    }),
              ]);
              showHashProjectDetail(vm, project);
            }
            return;
          }
          Vue.set(vm.downloadLinks, project.id, ['Download Build', [{
            href: project.id + '.zip',
            fileName: project.path + '-build.zip',
            name: 'Latest (.zip)',
          }]]);
          showHashProjectDetail(vm, project);
        });
      }
    }
    /**
     * Check project demo and set badge.
     * @param {object} vm - The Vue instance.
     * @param {object} project - Project overview object returned by Gitlab API.
     */
    function updateDemoState(vm, project) {
      axios.head(project.path)
          .then((response) => Vue.set(vm.projectHasDemo, project.id, true))
          .catch((error) => Vue.set(vm.projectHasDemo, project.id, false));
    }

    axios.get('https://gitlab.com/api/v4/users/wylieyyyy/projects?' +
        'order_by=path&sort=asc')
        .then((response) => {
          this.response = response.data;
          axios.get('builds.json')
              .then((builds) => {
                this.buildDetails = builds.data;
                updateJobBuild(this, response.data, builds.data);
                for (const project of response.data) {
                  updateScreenshots(this, project, builds.data);
                }
              })
              .catch((error) => {
                vm.errors = vm.errors.concat('Failed to fetch build detail.');
                for (const project of response.data) {
                  updateScreenshots(this, project);
                }
              });
          for (const project of response.data) {
            vm.readMe[project.id] = project.readme_url !== null;
            updateDemoState(this, project);
            updateLicense(this, project);
          }
        })
        .catch((error) => {
          vm.errors = vm.errors.concat('Failed to fetch project detail.');
        });
  },
});
