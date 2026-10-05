'use strict'

const build = require('pino-abstract-transport')
const { Transform, pipeline } = require('node:stream')
const { prettyFactory } = require('pino-pretty')

const DEFAULT_ERROR_LIKE_OBJECT_KEYS = ['err', 'error']
const WHITE = '\u001B[37m'

module.exports = function buildPinoPrettyPrefixTransport(options) {
  const { messageColorMarker, ...prettyOptions } = options

  if (typeof messageColorMarker !== 'string' || messageColorMarker.length === 0) {
    throw new TypeError('messageColorMarker must be a non-empty string')
  }

  return build(
    (source) => {
      const runtimeOptions = {
        ...prettyOptions,
        messageKey: source.messageKey,
        errorLikeObjectKeys: Array.from(
          new Set([...(prettyOptions.errorLikeObjectKeys || DEFAULT_ERROR_LIKE_OBJECT_KEYS), source.errorKey])
        ),
        customLevels: source.levels.values
      }
      const prettify = prettyFactory(runtimeOptions)
      const messageColor = runtimeOptions.colorize ? WHITE : ''
      const transform = new Transform({
        objectMode: true,
        autoDestroy: true,
        transform(log, _encoding, callback) {
          try {
            const line = prettify(log)
            callback(null, line?.replace(messageColorMarker, messageColor))
          } catch (error) {
            callback(error)
          }
        }
      })

      // Pino Pretty sanitizes the formatted line before this trusted color code is inserted.
      pipeline(source, transform, () => {})
      return transform
    },
    { enablePipelining: true, expectPinoConfig: true, metadata: false }
  )
}
