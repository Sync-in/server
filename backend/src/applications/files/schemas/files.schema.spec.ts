import { sql } from 'drizzle-orm'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import { childFilesMatch, childFilesReplacePath, files } from './files.schema'

describe('files path SQL helpers', () => {
  const dialect = new MySqlDialect()

  it('binds paths instead of interpolating them into the SQL statement', () => {
    const srcPath = "source\\'directory"
    const dstPath = "destination\\'directory"
    const query = dialect.sqlToQuery(
      sql`UPDATE ${files} SET ${files.path} = ${childFilesReplacePath(srcPath, dstPath)} WHERE ${childFilesMatch(srcPath)}`
    )

    expect(query.sql).not.toContain(srcPath)
    expect(query.sql).not.toContain(dstPath)
    expect(query.sql).not.toContain('REGEXP')
    expect(query.params).toEqual([dstPath, srcPath, srcPath, srcPath])
  })

  it('matches an exact path or a slash-separated descendant without ignoring trailing spaces', () => {
    const path = 'documents/project '
    const query = dialect.sqlToQuery(childFilesMatch(path))

    expect(query.sql).toBe("LEFT(CONCAT(`files`.`path`, '/'), CHAR_LENGTH(?) + 1) = CONCAT(?, '/')")
    expect(query.params).toEqual([path, path])
  })

  it('replaces only the matched source prefix and preserves its suffix', () => {
    const srcPath = 'documents/project'
    const dstPath = 'archives/project'
    const query = dialect.sqlToQuery(childFilesReplacePath(srcPath, dstPath))

    expect(query.sql).toBe('CONCAT(?, SUBSTRING(`files`.`path`, CHAR_LENGTH(?) + 1))')
    expect(query.params).toEqual([dstPath, srcPath])
  })
})
