import { getUncachableGitHubClient } from '../server/github-client';
import { execSync } from 'child_process';

function runGit(command: string): string {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (error: any) {
    if (error.stdout) return error.stdout.toString().trim();
    throw error;
  }
}

async function pushToGitHub() {
  const repoName = 'ModMapper';
  
  console.log('Getting GitHub client...');
  const octokit = await getUncachableGitHubClient();
  
  // Get authenticated user info
  const { data: user } = await octokit.users.getAuthenticated();
  console.log(`Authenticated as: ${user.login}`);
  
  // Get the current branch name
  let currentBranch: string;
  try {
    currentBranch = runGit('git rev-parse --abbrev-ref HEAD');
  } catch {
    currentBranch = 'main';
  }
  console.log(`Current branch: ${currentBranch}`);
  
  // Check if repo already exists
  let repoExists = false;
  try {
    await octokit.repos.get({
      owner: user.login,
      repo: repoName
    });
    repoExists = true;
    console.log(`Repository ${repoName} already exists. Will push to existing repo.`);
  } catch (error: any) {
    if (error.status === 404) {
      // Create new repository
      console.log(`Creating new repository: ${repoName}...`);
      await octokit.repos.createForAuthenticatedUser({
        name: repoName,
        description: 'Modbus Document Converter - Transform Modbus configuration files between CSV, XML, JSON, and PDF formats with AI-powered extraction',
        private: false,
        auto_init: false
      });
      console.log(`Repository created: https://github.com/${user.login}/${repoName}`);
    } else {
      throw error;
    }
  }
  
  // Configure git remote - use 'github' to avoid conflicts with existing 'origin'
  const remoteUrl = `https://github.com/${user.login}/${repoName}.git`;
  const remoteName = 'github';
  
  try {
    runGit(`git remote get-url ${remoteName}`);
    runGit(`git remote set-url ${remoteName} ${remoteUrl}`);
    console.log(`Updated git remote '${remoteName}'`);
  } catch {
    runGit(`git remote add ${remoteName} ${remoteUrl}`);
    console.log(`Added git remote '${remoteName}'`);
  }
  
  // Push to GitHub (don't force if repo already exists)
  console.log('Pushing to GitHub...');
  if (repoExists) {
    // For existing repos, try normal push first
    try {
      runGit(`git push -u ${remoteName} ${currentBranch}`);
    } catch {
      console.log('Normal push failed, attempting with --force (new repo initialization)...');
      runGit(`git push -u ${remoteName} ${currentBranch} --force`);
    }
  } else {
    // For new repos, we can safely push
    runGit(`git push -u ${remoteName} ${currentBranch}`);
  }
  
  console.log(`\nSuccess! Your code is now at: https://github.com/${user.login}/${repoName}`);
}

pushToGitHub().catch(console.error);
