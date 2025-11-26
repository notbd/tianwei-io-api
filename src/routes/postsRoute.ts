import { createPostsEndpoint } from '@/factories/createPostsEndpoint'

/**
 * Public version of the posts API.
 * Returns only published posts.
 */
const postsRoute = createPostsEndpoint()

export default postsRoute
