# Content search with MariaDB

`FilesContentStoreMySQL` adapts user input to the Boolean mode of
`MATCH ... AGAINST`, then builds snippets from the selected documents.

## Search syntax

| Input              | Behavior                                                                 |
|--------------------|--------------------------------------------------------------------------|
| `report budget`    | Optional terms: at least one of them must match.                         |
| `+report`          | Required term.                                                           |
| `-draft`           | Excluded term. A search must still contain at least one positive term.   |
| `test+` or `test-` | The invalid trailing operator is removed before querying MariaDB.        |
| `set*`             | Prefix search; `setting` may match. Only a suffix wildcard is supported. |

Sequences of `+` and `-` that do not target a term are removed outside quoted phrases. For example, `test+` becomes `test` and `test+,` becomes
`test,`. Operators placed at the beginning of a term retain their Boolean meaning.

## Compound terms and quoted phrases

An unquoted term containing a separator between multiple tokens is automatically converted into a MariaDB phrase:

| Input                | Normalized query       |
|----------------------|------------------------|
| `set-variable`       | `"set-variable"`       |
| `2017-03-05`         | `"2017-03-05"`         |
| `contact@financo.fr` | `"contact@financo.fr"` |
| `+set-variable`      | `+"set-variable"`      |

An already quoted phrase, such as `"configure set-variable now"`, remains unchanged. In MariaDB, quotes require a sequence of **tokens**, not a
character-for-character match: `"set-variable"` may therefore match `set variable`. Punctuation (`-`, `@`, `.`, etc.) generally acts as a separator
for the FULLTEXT tokenizer.

## Scripts without FULLTEXT segmentation

If at least one term contains a Han, Hiragana, Katakana, Hangul, Thai, Lao, Khmer, or Myanmar character, the entire query uses `LIKE`:

- required terms are combined with `AND`;
- optional terms are combined with `OR`;
- exclusions use `NOT LIKE`;
- `%`, `_`, and the escape character are escaped.

This fallback enables searches without an `ngram` tokenizer, but it scans content and is more expensive than a FULLTEXT index.

## SQL execution

The search runs in two phases:

1. MariaDB selects only `sourceIndex`, `id`, and `score` from each table, then applies sorting and the limit to the `UNION ALL` result.
2. A second query loads metadata and `LONGTEXT` only for the selected identifiers. The order calculated during the first phase is restored in memory.

The full content is then used to generate snippets, but it is never returned in the search result.

## Snippets and highlighting

- Only positive terms are highlighted with `<mark>`.
- A document returns at most 5 snippets.
- A snippet keeps at most 10 words before and 15 words after the match, with safety limits of 512 and 768 characters.
- Nearby matches are grouped. Snippets containing the most distinct terms, followed by the highest number of occurrences, are prioritized.
- A compound term finds and highlights the separators actually present in the content: `set-variable` may produce
  `<mark>set variable</mark>`.
- Highlighting handles common Latin variants with or without accents, such as `resume` and `résumé`. SQL search also depends on the table collation
  (`utf8mb4_general_ci`).
- With a suffix wildcard, the end-of-word boundary is removed from highlighting.

## Known limitations

- The HTTP query is limited to 512 characters; the result limit defaults to 100 and cannot exceed 100.
- Terms shorter than 2 characters are ignored by the application.
- Stopwords and the minimum indexed token length depend on the MariaDB configuration and storage engine. A term accepted by the application may
  therefore be absent from the index.
- FULLTEXT scores depend on each table's statistics. A score from a user index is not strictly comparable with one from a space or share index.
- A MariaDB phrase compares consecutive tokens; it does not guarantee that the punctuation entered matches the document's punctuation.
