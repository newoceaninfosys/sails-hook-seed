"use strict";


/**
 * @function
 * @description log seed activities
 * @param  {Object} model valid sails model
 * @param  {Object} data  data to seed into model
 */
function log(model, data) {
  //TODO handle log level configurations
  //TODO check if logging is allowed in current environment

  //convert seed data into string
  var seedAsString = JSON.stringify(data);

  //if convertion is success
  if (seedAsString) {
    var ellipsis = "...";

    //deduce maximum logging message length
    var debugLength = 50 - ellipsis.length;

    //if seed string length is greater than
    //maximum allowed seed log message
    //reduce seed string to the maximum allowed
    //log message length
    if (seedAsString.length > debugLength) {
      seedAsString = seedAsString.substring(0, debugLength) + ellipsis;
    }
  }

  //TODO use provided log level from configuration
  sails.log.debug("%s %s", model._adapter.identity, seedAsString);
}


/**
 * @function
 * @description apply model associations
 * @param  {String} modelIdentity model name
 * @param  {Object} model         model record
 * @param  {Object} record        stored record
 * @param  {Object} association   association meta data and data
 * @param  {Function} next        callback
 */
function applyAssociation(modelIdentity, model, record, association, next) {
  var message = modelIdentity + " { id: " + record.id + ", " +
    association.alias + ": " +
    JSON.stringify(association.idsList) + " }";

  sails.log.debug(message);

  var associationWorks = [];

  association.idsList.forEach(function(asso) {
    associationWorks.push(function(next1) {
      if (sails.models[association.model]) {
        Object.assign(asso, { post: record.id });
        sails.models[association.model].findOrCreate(asso, asso)
          .exec(function(error, result) {
            if (error) {
              sails.log.error(error.message);
              return next1(error);
            }
            next1(null, result);
          });
      } else {
        sails.log.error("Model `" + association.model + "` not found!");
        return next1(error);
      }
    });
  });

  async.parallel(associationWorks, function(error, result) {
    var associationIds = result.map(function(asso) {
      return asso.id;
    });
    sails.log.debug(modelIdentity + " Add associations for model " + association.model + " id: " + record.id + " with accosiations " + JSON.stringify(associationIds));
    model.addToCollection(record.id, association.alias, associationIds)
      .exec(function(err, result) {
        if (err) {
          throw err;
        }
        next(null);
      });
  });
}


/**
 * @function
 * @description find or create model
 * @param  {Object} model      valid sails model
 * @param  {Object} data data seed
 * @param  {Function} next     callback to be invoked on success or error
 */
function findOrCreate(model, dataObject, next) {
  // prepare pendingAssociations list
  var pendingAssociations = [];

  //visit all model association and prepare
  //migrations work
  for (var i = 0; i < model.associations.length; i++) {
    var association = model.associations[i];

    //TODO what about `model` associations
    if (association.type !== "collection") {
      continue;
    }

    if (!dataObject[association.alias]) {
      continue;
    }

    association = {
      alias: model.associations[i].alias,
      idsList: dataObject[association.alias],
      model: model.associations[i].model ? model.associations[i].model : model.associations[i].collection
    };

    // remove association ids from the seed object
    delete dataObject[association.alias];

    pendingAssociations.push(association);
  }

  model.findOrCreate(dataObject, dataObject, function(error, record) {
    //TODO do we log before performing an action or after performing it
    //TODO what this log inform?
    log(model, dataObject);

    if (error) {
      sails.log.error(error.message);
      return next(error);
    }

    var req = model.findOne({ id: record.id });

    pendingAssociations.forEach(function(association) {
      req.populate(association.alias);
    });

    req.exec(function(error, record) {
      if (error) {
        sails.log.error(error.message);
        return next(error);
      }

      var modelIdentity = model._adapter.identity;
      var associationsWork = [];
      pendingAssociations.forEach(function(association) {
        var work = function(next) {
          applyAssociation(modelIdentity, model, record, association, next);
        };
        associationsWork.push(work);
      });

      //TODO what about created record?
      //is there no need to return it
      next(null, associationsWork);
    });
  });
}


/**
 * @function
 * @description prepare work to be performed during seeding the data
 * @param  {Object} seeds environment specific loaded seeds from the seeds directory
 * @return {Array} a collection of works to be performed during data loading
 */
exports = module.exports = function(seeds) {
  //work to be done
  //in parallel during
  //data seeding
  var work = [];

  //prepare all seeds
  //data for parallel execution
  _.keys(seeds)
    .forEach(function(seed) {
      // deduce model globalId
      var modelGlobalId = seed.replace(/Seed$/, "").toLowerCase();

      //grab sails model from its globalId
      //NOTE!: this is safe cause other may
      //enable model to be global but others
      //may not
      var Model = sails.models[modelGlobalId];

      //grab data to load
      //from the seed data attribute
      var seedData = seeds[seed];

      //prepare work from seed data
      exports.prepare(work, Model, seedData);

    });

  return work;
};


/**
 * @description Take seed data and check if it is of array or object type
 *              and prepare work to be performed from it
 * @param  {Array} work     A collection of database queries to be
 *                          performed to seed data into database
 * @param  {Object} model   A valid sails model
 * @param  {Object|Array|Function} seedData An array or object contains
 *                                          data or a function to be evaluated
 *                                          to obtain data to seeded into database
 */
exports.prepare = function(work, model, seedData) {
  //is data just a plain object
  if (_.isPlainObject(seedData)) {
    //push work to be done
    work.push(function(next) {
      //create seed function
      findOrCreate(model, seedData, next);
    });
  }

  //is array data
  if (_.isArray(seedData)) {
    _.forEach(seedData, function(data) {
      //push work to be done
      work.push(function(next) {
        //create seed function
        findOrCreate(model, data, next);
      });
    });
  }

  //is functional data
  if (_.isFunction(seedData)) {
    //evaluate function to obtain data
    seedData(function(error, data) {
      //current log error and continue
      //
      //TODO should we throw?
      if (error) {
        sails.log.error(error);
      }

      //invoke prepare with data
      else {
        exports.prepare(work, model, data);
      }
    });
  }
};
