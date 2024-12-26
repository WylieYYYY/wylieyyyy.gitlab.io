'use strict';

const js = require('@eslint/js');
const google = require('eslint-config-google');
const globals = require('globals');

module.export = [
  js.configs.recommended,
  google,
  {
    languageOptions: {
      ecmaVersion: 8,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.node,
      }
    },
  },
  {
    files: ['setup.js'],
    languageOptions: {
      ecmaVersion: 2018,
      globals: globals.node,
    },
  }
];
