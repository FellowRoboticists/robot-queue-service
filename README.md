robot-queue-service
===================

An npm module to support bidirectional communications via a work queue
implementation focused on robot communications.

Note: Earlier implementations of this module supported the beanstalkd
work queue implementation. As of version 1.3+ it has been switched over
to use RabbitMQ. The primary motivation for this change was the built-in
security mechanisms in RabbitMQ vs beanstalkd. Having to use Stunnel 
to provide equivalent security for beanstalkd turned out to be unstable
in weak network environments.

Usage
-----

The following is an example of how you might set this up.

    const queueSVC = require('robot-queue-service');

    const securityOptions = {
      cert: fs.readFileSync(options.clientCert),
      key: fs.readFileSync(options.clientKey),
      rejectUnauthorized: false,
      ca: [ fs.readFileSync(options.caCert) ]
    }
 
    ...

    const workerFunction = (message) => {
      console.log("The message received")
    }

    queueSVC.connect("amqps://localhost:5671", serverOptions)
      .then( () => {
        return queueSVC.createChannel()
          .then((ch) => {
            return queueSVC.consume(null, 'theQueue', workerFunction)
          })
      )}
      .catch((err) => {
        console.error("Error dealing with the queue: %j")
      })


Copyright
=========

Copyright (c) 2016 Naive Roboticist

See LICENSE.txt for details.
