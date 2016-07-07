#!/usr/bin/env node
'use strict'

const program = require('commander')
const winston = require('winston')
const fs = require('fs')

winston.level = process.env.LOG_LEVEL || 'info'

const amqp = require('amqplib')

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

const checkQueue = (options, ch) => {
  return ch.checkQueue(options.queue)
    .then((resp) => {
      console.log('checkQueue Results: %j', resp)
    })
}

const purgeQueue = (options, ch) => {
  return ch.purgeQueue(options.queue)
    .then((resp) => console.log(`Queue '${options.queue}' purged. Messages deleted: %j`, resp))
}

const deleteQueue = (options, ch) => {
  return ch.deleteQueue(options.queue, { ifUnused: true, ifEmpty: true })
    .then(() => console.log(`Queue '${options.queue}' deleted`))
}

const sendToQueue = (options, ch) => {
  return new Promise((resolve, reject) => {
    if (options.args.length < 1) return reject(new Error('Must specify argument containing the job to queue'))

    ch.assertQueue(options.queue, { durable: false })
      .then((resp) => {
        let res = ch.sendToQueue(options.queue, new Buffer(options.args[0]))
        console.log('Sent to queue: %j', res)
      })
      .then(resolve)
      .catch(reject)
  })
}

const consume = (options, ch) => {
  /**
   * This function called when a new message is delivered.
   */
  let queueWorker = function qWorker (msg) {
    console.log('Message:')
    console.log(`  Content: ${msg.content.toString()}`)
    console.log('  Fields: %j', msg.fields)
    console.log('  Properties: %j', msg.properties)

    ch.ack(msg)
  }

  return ch.assertQueue(options.queue, { durable: false })
    .then((res) => ch.consume(options.queue, queueWorker, { noAck: false }))
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

const processCommand = (options, ch) => {
  return new Promise((resolve, reject) => {
    if (!commands[options.command]) return reject(new Error(`Invalid command: ${options.command}`))

    return commands[options.command](options, ch)
      .then(resolve)
      .catch(reject)
  })
}

// Connect to the server
amqp.connect(url(program), serverOptions(program))
  .then((conn) => {
    return conn.createChannel()
      .then((ch) => processCommand(program, ch).then(() => conn))
      .catch((err) => {
        conn.close()
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
      setTimeout(() => conn.close(), 1000)
    }
  })
  .catch((err) => {
    if (err instanceof Error) {
      console.error(err.stack)
    } else {
      console.error('Error: %j', err)
    }
  })
