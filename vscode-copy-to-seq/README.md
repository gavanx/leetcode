# Copy to Seq Renamer

Auto-rename newly created files whose names end with:

- `-copy`
- ` copy`
- ` copy N` / ` copy(N)`

Into an incrementing `-N` form (preserving the extension).

## Settings

- `copyToSeq.enabled`: enable/disable the rename behavior
- `copyToSeq.start`: starting number when generating `-N`
- `copyToSeq.debug`: log decisions to the `CopyToSeq` Output channel

## Example

- Create/paste `foo copy.js` → becomes `foo-1.js`
- Paste again (`foo copy 2.js`) → becomes `foo-2.js`
