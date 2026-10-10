/**
 * Which build of the parser read a document.
 *
 * Every library run used to store `parserVersion: null`, and the service's own
 * version is a constant ('0.1.0') that never changed between builds, so after
 * a deploy nobody could tell whether a reading came from the old code or the
 * new. A paid read that landed minutes before a rollout looked exactly like
 * one read after it.
 *
 * The build is, in order:
 *  - PARSER_BUILD, set at image build time (`--build-arg PARSER_BUILD=<commit>`,
 *    see the Dockerfile), the commit the image was built from;
 *  - otherwise the pod's name (`pod:<HOSTNAME>`). A pod name carries its
 *    ReplicaSet's hash, and the ReplicaSet names its image, so even an image
 *    built without the argument can be traced to the code that ran;
 *  - otherwise 'unknown', said plainly rather than left null.
 */
const MAX_LENGTH = 100;

function clean(value: string | undefined): string {
  return String(value ?? '').trim().replace(/[^\w.:/@+-]/g, '').slice(0, MAX_LENGTH);
}

export function parserBuild(env: NodeJS.ProcessEnv = process.env): string {
  const build = clean(env.PARSER_BUILD);
  if (build) return build;
  const host = clean(env.HOSTNAME);
  if (host) return clean(`pod:${host}`);
  return 'unknown';
}
