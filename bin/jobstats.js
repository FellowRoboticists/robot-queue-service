#!/usr/bin/env node
'use strict'

const program = require('commander')
const winston = require('winston')
const fs = require('fs')

winston.level = process.env.LOG_LEVEL || 'info'

const queue = require('../lib/index')

// Option default values
const DEFAULT_HOST = 'localhost'
const DEFAULT_PORT = '5672'
const DEFAULT_SECURE_PORT = '5671'
const DEFAULT_COMMAND = 'checkQueue'
const DEFAULT_CA_CERT = '/etc/ssl/certs/st-ca.crt'
const DEFAULT_CLIENT_CERT = '/home/dsieh/certs/stc-cert.pem'
const DEFAULT_CLIENT_KEY = '/home/dsieh/certs/stc-key.pem'

// Set up the command line parsing
program
  .version('0.0.1')
  .option('--host <host>',
          `Hostname of server (default: ${DEFAULT_HOST})`,
          DEFAULT_HOST)
  .option('-p --port <port>',
          `Port number of server (default: ${DEFAULT_PORT})`,
          DEFAULT_PORT)
  .option('--secure-port <port>',
          `Port number of secure server (default ${DEFAULT_SECURE_PORT}`,
          DEFAULT_SECURE_PORT)
  .option('-c --command <command>',
          `Specify the command to run (default: ${DEFAULT_COMMAND})`,
          DEFAULT_COMMAND)
  .option('--ca-cert <path-to-cert>',
          `Specify the path to the CA certificate. (Default: ${DEFAULT_CA_CERT})`,
          DEFAULT_CA_CERT)
  .option('--client-cert <path-to-client-cert',
          `Specify the path to the client certificate. (Default: ${DEFAULT_CLIENT_CERT})`,
          DEFAULT_CLIENT_CERT)
  .option('--client-key <path-to client-key',
          `Specify the path to the client key. (Default: ${DEFAULT_CLIENT_KEY})`,
          DEFAULT_CLIENT_KEY)
  .option('-q --queue <queue>',
          'The queue to use (default: default)',
          'default')
  .option('-s --secure',
          'Use secure communications to server')
  .option('-v --verbose',
          'Be verbose when processing')
  .parse(process.argv)

const protocol = (options) => (options.secure) ? 'amqps' : 'amqp'
const port = (options) => (options.secure) ? options.securePort : options.port
const url = (options) => `${protocol(options)}://${options.host}:${port(options)}`

const serverOptions = (options) => {
  if (options.secure) {
    return {
      cert: fs.readFileSync(options.clientCert),
      key: fs.readFileSync(options.clientKey),
      rejectUnauthorized: false,
      ca: [ fs.readFileSync(options.caCert) ]
    }
  } else {
    return {}
  }
}

if (program.verbose) {
  console.log('Options: ')
  console.log(`  Host:        ${program.host}`)
  console.log(`  Port:        ${program.port}`)
  console.log(`  Comand:      ${program.command}`)
  console.log(`  Queue:       ${program.queue}`)
  console.log(`  Verbose:     ${program.verbose}`)
  console.log(`  Argument:    ${program.args}`)
  console.log(`  Secure:      ${program.secure}`)
  console.log(`  CA Cert:     ${program.caCert}`)
  console.log(`  Client Cert: ${program.clientCert}`)
  console.log(`  Client Key:  ${program.clientKey}`)
  console.log(`  URL:         ${url(program)}`)
  console.log()
}

const checkQueue = (options) => {
  return queue.checkQueue(null, options.queue)
    .then((resp) => {
      console.log('checkQueue Results: %j', resp)
    })
}

const purgeQueue = (options) => {
  return queue.purgeQueue(null, options.queue)
    .then((resp) => console.log(`Queue '${options.queue}' purged. Messages deleted: %j`, resp))
}

const deleteQueue = (options) => {
  return queue.deleteQueue(null, options.queue, { ifUnused: true, ifEmpty: true })
    .then(() => console.log(`Queue '${options.queue}' deleted`))
}

const sendToQueue = (options) => {
  if (options.args.length < 1) return Promise.reject(new Error('Must specify argument containing the job to queue'))

  return queue.sendToQueue(null, options.queue, new Buffer(options.args[0]))
    .then(() => console.log(`Message placed in '${options.queue}'`))
}

const consume = (options) => {
  /**
   * This function called when a new message is delivered.
   */
  let queueWorker = function qWorker (msg) {
    console.log('Message:')
    console.log(`  Content: ${msg}`)
  }

  return queue.consume(null, options.queue, queueWorker)
}

/**
 * The list of commands that can be invoked from the
 * command line argument (-c <command>)
 */
const commands = {
  checkQueue: checkQueue,
  deleteQueue: deleteQueue,
  purgeQueue: purgeQueue,
  sendToQueue: sendToQueue,
  consume: consume
}

const processCommand = (options) => {
  return new Promise((resolve, reject) => {
    if (!commands[options.command]) return reject(new Error(`Invalid command: ${options.command}`))

    return commands[options.command](options)
      .then(resolve)
      .catch(reject)
  })
}

// Connect to the server
queue.connect(url(program), serverOptions(program))
  .then((conn) => {
    return queue.createChannel()
      .then((ch) => processCommand(program).then(() => conn))
      .catch((err) => {
        queue.close()
        throw err
      })
  })
  .then((conn) => {
    if (program.command === 'consume') {
      console.log('Hit CTRL-C to stop consuming messages')
    } else {
      // Some commands (sendToQueue) are sensitive to having
      // the connection open for a period of time before
      // closing it. Just delaying the close for a second to
      // give these commands time to do their thing.
      setTimeout(() => queue.close(), 1000)
    }
  })
  .catch((err) => {
    if (err instanceof Error) {
      console.error(err.stack)
    } else {
      console.error('Error: %j', err)
    }
  })
