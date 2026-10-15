'use strict';

const gulp = require('gulp');
const build = require('@microsoft/sp-build-web');
build.addSuppression(`Warning - [sass] The local CSS class 'ms-Grid' is not camelCase and will not be type-safe.`);
// Registration is deliberately performed through an administrator-created User Custom Action.
build.addSuppression('Warning - LaufschriftApplicationCustomizer: Admins can make this solution available to all sites in the'
  + ' organization, but extensions won’t automatically appear. SharePoint Framework extensions must'
  + ' be specifically associated to sites, lists, and fields programmatically to be visible to site users.');

build.initialize(gulp);
