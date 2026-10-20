export async function getPosts() {
  await new Promise(r => setTimeout(r, 800));
  return ["Post A", "Post B", "Post C"];
}