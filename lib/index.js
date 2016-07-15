'use strict'

module.exports = (function () {
  const amqp = require('amqplib')

  /**
   * The single connection.
   */
  let serverConnection = null

  /**
   * The set of channels we're holding onto.
   */
  let connectedChannels = { }

  /**
   * Return a valid channel name even if the caller
   * doesn't provide one.
   */
  const channelName = (cName) => cName || 'default'

  /**
   * Only need a single connection even if we are listening
   * and talking as long as you're doing it on different
   * channels.
   */
  const connect = (url, connectOptions) => {
    // Return the current connection if it already exists
    if (serverConnection) return Promise.resolve(serverConnection)

    return amqp.connect(url, connectOptions)
      .then((conn) => {
        serverConnection = conn
        return conn
      })
  }

  /**
   * Create a channel with a specific name. That way you can always
   * send commands to the named channel at some point in the future.
   */
  const createChannel = (chName) => {
    if (!serverConnection) return Promise.reject(new Error('No server connection available'))

    let cName = channelName(chName)

    // If the named channel already exists, return it.
    if (connectedChannels[cName]) return Promise.resolve(connectedChannels[cName])

    return serverConnection.createChannel()
      .then((ch) => {
        connectedChannels[channelName(chName)] = ch
        return ch
      })
  }

  /**
   * Close the connection.
   */
  const close = () => {
    if (!serverConnection) return Promise.reject(new Error('No server connection available'))

    return serverConnection.close()
  }

  /**
   * Performs a queue check via the specified channel
   */
  const checkQueue = (chName, queue) => {
    let channel = connectedChannels[channelName(chName)]

    if (!channel) return Promise.reject(new Error(`Channel ${chName} not defined`))

    return channel.checkQueue(queue)
  }

  /**
   * Purges the queue via the specified channel.
   */
  const purgeQueue = (chName, queue) => {
    let channel = connectedChannels[channelName(chName)]

    if (!channel) return Promise.reject(new Error(`Channel ${chName} not defined`))

    return channel.purgeQueue(queue)
  }

  /**
   * Deletes the queue via the specified channel.
   */
  const deleteQueue = (chName, queue) => {
    let channel = connectedChannels[channelName(chName)]

    if (!channel) return Promise.reject(new Error(`Channel ${chName} not defined`))

    return channel.deleteQueue(queue, { ifUnused: true, ifEmpty: true })
  }

  /**
   * Sends a message to the queue via the specified channel.
   */
  const sendToQueue = (chName, queue, messageBuffer) => {
    let channel = connectedChannels[channelName(chName)]

    if (!channel) return Promise.reject(new Error(`Channel ${chName} not defined`))

    return channel.assertQueue(queue, { durable: false })
      .then((resp) => channel.sendToQueue(queue, messageBuffer))
  }

  /**
   * Consumes messages from the queue via the specified channel.
   */
  const consume = (chName, queue, worker) => {
    let channel = connectedChannels[channelName(chName)]

    if (!channel) return Promise.reject(new Error(`Channel ${chName} not defined`))

    // The worker function used to ack the message.
    let qWorker = (msg) => {
      if (typeof worker === 'object') {
        worker.process(msg.content.toString())
      } else {
        worker(msg.content.toString())
      }

      channel.ack(msg)
    }

    return channel.assertQueue(queue, { durable: false })
      .then((res) => channel.consume(queue, qWorker, { noAck: false }))
  }

  const hasConnection = (name) => {
    return !!connectedChannels[name]
  }

  const mod = {
    close: close,
    connect: connect,
    createChannel: createChannel,
    checkQueue: checkQueue,
    purgeQueue: purgeQueue,
    deleteQueue: deleteQueue,
    sendToQueue: sendToQueue,
    consume: consume,
    hasConnection: hasConnection
  }

  return mod
}())
