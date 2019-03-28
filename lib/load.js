'use strict';

//dependencies
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var prepareWork = require(path.join(__dirname, 'work'));
var includeAll = require('include-all');

/**
 * @function
 * @description loading seed's data into configured model persistent storage
 * @param {Object} config  seed hook configurations
 * @param {Function} done  a callback to invoke on after seeding
 */
module.exports = function (config, done) {
  //guess current sails environment
  var environment = sails.config.environment || 'test';

  //deduce seeds path to use
  //based on current environment
  var seedsPath =
    path.join(sails.config.appPath, config.path, environment);

  //log seed environment
  sails.log.debug('start seeding %s data', environment);

  //log seed location
  sails.log.debug('seeding from %s', seedsPath);

  //load all seeds available
  //in   `seedsPath`
  var seeds = includeAll({
    dirname: seedsPath,
    filter: /(.+Seed)\.js$/,
    excludeDirs: /^\.(git|svn)$/,
    optional: true
  });

  var extraPaths = [];

  if (config.extraPaths && config.extraPaths.length > 0) {
    config.extraPaths.forEach(function (ep) {
      if (fs.existsSync(path.join(sails.config.appPath, ep, environment))) {
        var extraSeed = includeAll({
          dirname: path.join(sails.config.appPath, ep, environment),
          filter: /(.+Seed)\.js$/,
          excludeDirs: /^\.(git|svn)$/,
          optional: true
        });
        seeds = _.mergeWith(seeds, extraSeed, function customizer(objValue, srcValue) {
          if (_.isArray(objValue)) {
            return objValue.concat(srcValue);
          }
        });
      }
    })
  }

  //prepare seeding work to perfom
  var work = prepareWork(seeds);

  //if there is a work to perform
  if (_.size(work) > 0) {

    async
      .waterfall([
          function seedModels(next) {
            //now lets do the work
            //in parallel fashion
            async.parallel(work, next);
          },
          function seedAssociations(associationsWork, next) {
            // flatten lists
            associationsWork = [].concat.apply([], associationsWork);

            if (_.size(associationsWork) > 0) {

              //seed associations if available
              sails.log.debug('load associations');

              //TODO what results to log?
              async.parallel(associationsWork, next);
            } else {
              next();
            }
          }
        ],
        function (error, results) {
          //signal seeding complete
          sails.log.debug('complete seeding %s data', environment);

          done(error, {
            environment: environment,
            data: results
          });
        });
  }
  //nothing to perform back-off
  else {
    done();
  }
};
