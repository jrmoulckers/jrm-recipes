// No per-replica data cache: tag invalidation cannot reach another host/revision.
module.exports = class ContainerCache {
  async get() {
    return null;
  }
  async set() {}
  async revalidateTag() {}
  resetRequestCache() {}
};
