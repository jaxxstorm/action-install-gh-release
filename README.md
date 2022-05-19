# `install-gh-release` GitHub Action

This repository contains an action for use with GitHub Actions, which will install any GitHub release into your action environment:

This is especially useful when installing arbitrary Go binaries. It can lookup the latest version, or download a specific tag.

## Usage

This action requires a Github Token (`GITHUB_TOKEN`) in the environment to authenticate with.

### Grab the Latest Version

```yaml
# ...
steps:
  - name: Install go-task
    uses: jaxxstorm/action-install-gh-release@v1.5.0
    with: # Grab the latest version
      repo: go-task/task
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} # Github token scoped to step
```

### Grab a Specific Tags

```yaml
# ...
jobs:
  my_job:
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} # Github token scoped to job
    steps:
      - name: Install tf2pulumi
        uses: jaxxstorm/action-install-gh-release@v1.5.0
        with: # Grab a specific tag
          repo: pulumi/tf2pulumi
          tag: v0.7.0
```

### Grab a Specific Platform And/Or Architecture

```yaml
name: my_action

env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} # Github token scoped to action

jobs:
  my_job:
    steps:
      - name: Install tfsec
        uses: jaxxstorm/action-install-gh-release@v1.5.0
        with: # Grab a specific platform and/or architecture
          repo: aquasecurity/tfsec
          platform: linux
          arch: x86-64
```

### Caching

This action can use [actions/cache](https://github.com/actions/cache) under the hood. Caching needs to be enabled explicitly and only works for specific tags.

```yaml
# ...
jobs:
  my_job:
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} # Github token scoped to job
    steps:
      - name: Install tf2pulumi
        uses: jaxxstorm/action-install-gh-release@v1.5.0
        with: # Grab a specific tag with caching
          repo: pulumi/tf2pulumi
          tag: v0.7.0
          cache: enable
```

Caching helps avoid
[Rate limiting](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#requests-from-github-actions), since this action does not need to scan tags and releases on a cache hit. Caching currently is not expected to speed up installation.

## Finding a release

By default, this action will lookup the Platform and Architecture of the runner and use those values to interpolate and match a release package. **The release package name is first converted to lowercase**. The match pattern is:

```js
`(osPlatform|osArchs).*(osPlatform|osArchs).*\.(tar\.gz|zip)`;
```

Natively, the action will only match the following platforms: `linux`, `darwin`, `windows`.

Some examples of matches:

- `my_package_linux_x86_64.tar.gz` (or `.zip`)
- `my_package_x86_64_linux.tar.gz` (or `.zip`)
- `my_package.linux.x86_64.tar.gz` (or `.zip`)
- `my_package.x86_64.linux.tar.gz` (or `.zip`)
- `linux_x86_64_my_package.tar.gz` (or `.zip`)
- `x86_64_linux_my_package.tar.gz` (or `.zip`)
- `linux.x86_64.my_package.tar.gz` (or `.zip`)
- `x86_64.linux.my_package.tar.gz` (or `.zip`)
- `linux_x86_64.tar.gz` (or `.zip`)
- `x86_64_linux.tar.gz` (or `.zip`)
- `linux.x86_64.tar.gz` (or `.zip`)
- `x86_64.linux.tar.gz` (or `.zip`)
