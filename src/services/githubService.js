const axios = require('axios');

const githubClient = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Accept: 'application/vnd.github+json',
    ...(process.env.GITHUB_TOKEN && {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    }),
  },
});

async function extractUsername(githubUrl) {
  const cleaned = githubUrl.trim().replace(/\/$/, '');
  const parts = cleaned.split('/');
  return parts[parts.length - 1];
}

async function fetchGithubData(githubUrl) {
  const username = await extractUsername(githubUrl);

  // 1. Fetch user profile
  const { data: profile } = await githubClient.get(`/users/${username}`);

  // 2. Fetch repos (top 20 by updated date)
  const { data: repos } = await githubClient.get(`/users/${username}/repos`, {
    params: { sort: 'updated', per_page: 20 },
  });

  // 3. For each repo, fetch languages
  const repoDetails = await Promise.all(
    repos.map(async (repo) => {
      const { data: languages } = await githubClient.get(
        `/repos/${username}/${repo.name}/languages`
      );

      // Try to fetch README
      let readme = null;
      try {
        const { data: readmeData } = await githubClient.get(
          `/repos/${username}/${repo.name}/readme`
        );
        const decoded = Buffer.from(readmeData.content, 'base64').toString('utf-8');
        readme = decoded.slice(0, 500); // first 500 chars only
      } catch {
        readme = null;
      }

      return {
        name: repo.name,
        description: repo.description,
        url: repo.html_url,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        languages,
        readme,
        updated_at: repo.updated_at,
      };
    })
  );

  // 4. Aggregate all languages across repos
  const allLanguages = {};
  repoDetails.forEach((repo) => {
    Object.entries(repo.languages).forEach(([lang, bytes]) => {
      allLanguages[lang] = (allLanguages[lang] || 0) + bytes;
    });
  });

  return {
    username,
    name: profile.name,
    bio: profile.bio,
    public_repos: profile.public_repos,
    followers: profile.followers,
    repos: repoDetails,
    languages: allLanguages,
  };
}

module.exports = { fetchGithubData };