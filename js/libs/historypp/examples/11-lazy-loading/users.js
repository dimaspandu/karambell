export async function getUsers() {
  await new Promise(r => setTimeout(r, 800));
  return ["Alice", "Bob", "Charlie"];
}