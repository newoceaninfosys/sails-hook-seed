'use strict';

//dependencies
var path = require('path');
var loadSeeds = require(path.join(__dirname, 'lib', 'load'));
/**
 * @description DRY data seeding for sails.

 * @param  {Object} sails a sails application
 * @return {Object} sails-hook-seed which follow installable sails-hook spec
 */
module.exports = function(sails) {
    //return hook
    return {

        //Defaults configurations
        defaults: {
            //set seeding to be active by default
            active: true,

            //directory where migration resides
            //relative to `sails.appPath`
            path: 'seeds',
            extraPaths: false
        },

        //Runs automatically when the hook initializes
        initialize: function(done) {
            //reference this hook
            var hook = this;

            //extend defaults configuration
            //with provided configuration from sails
            //config
            var config =
                _.extend(hook.defaults, sails.config.seed);

            //if seeding is disabled back-off
            if (!config.active) {
                done();
            }

            //continue with seeding
            else {
                // Lets wait on some of the sails core hooks to
                // finish loading before 
                // load `sails-hook-seed`
                var eventsToWaitFor = [];

                if (sails.hooks.orm) {
                    eventsToWaitFor.push('hook:orm:loaded');
                }

                if (sails.hooks.pubsub) {
                    eventsToWaitFor.push('hook:pubsub:loaded');
                }

                sails
                    .after(eventsToWaitFor, function() {
                        //load seeds
                        loadSeeds(config, done);
                    });
            }

        }
    };

};
