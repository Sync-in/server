import { toErrorMessage } from './errors.js'

describe(toErrorMessage.name, () => {
  it.each([
    [new Error('failure'), 'failure'],
    [{ message: 'failure' }, 'failure'],
    ['failure', 'failure'],
    [42, '42']
  ])('should extract a message from %p', (error, expectedMessage) => {
    expect(toErrorMessage(error)).toBe(expectedMessage)
  })

  it.each([null, undefined, '', new Error(''), { message: '' }])('should use the fallback for %p', (error) => {
    expect(toErrorMessage(error, 'fallback')).toBe('fallback')
  })

  it('should use the fallback when the value cannot be inspected or stringified', () => {
    const error = new Proxy(
      {},
      {
        has: () => {
          throw new Error('inspection failure')
        }
      }
    )

    expect(toErrorMessage(error, 'fallback')).toBe('fallback')
  })
})
