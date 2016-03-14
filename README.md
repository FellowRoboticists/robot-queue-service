robot-queue-service
===================

An npm module to support bidirectional communications via beanstalk
focused on robot communications.

Usage
-----

The following is an example of how you might set this up.

    const queueSVC = require('queue-service');

    const beanstalk = {
      host: 'localhost',
      port: 11300
    };

    ...

    // Define a worker to process jobs from the queue
    const Worker = function() {

      // Method required by beanstalk listener
      this.process = function(job) {
        console.log("The payload: %j", payload);
      };
    };

    queueSVC.connect("connectionName", beanstalk.host, beanstalk.port).
      then( () => {
        var worker = new Worker();
        queueSVC.processJobsInTube('incomingCommands', 'tubeName', worker).
          then( () => console.log("Done") );
      )};


Copyright
=========

Copyright (c) 2016 Naive Roboticist

See LICENSE.txt for details.
