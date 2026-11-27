/*** Validate a bounded Git branch name while preserving slash-containing branch paths. */
export function isWorkspaceBranchName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 255 &&
    [...value].every(character => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
  );
}
