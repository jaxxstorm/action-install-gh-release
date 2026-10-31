# `install-gh-release` GitHub Action

This repository contains an action for use with GitHub Actions, which will install any GitHub release into your action environment:

This is especially useful when installing arbitrary Go binaries. It can lookup the latest version, or download a specific tag.

## Testing

The repository keeps the existing workflow-level integration tests and now also runs fast unit tests with coverage enforced for `src/install.ts`.

Run the unit tests locally with:

```bash
npm run test:unit
```

Run the unit tests with coverage locally with:

```bash
npm run test:unit:coverage
```

CI uploads the HTML and LCOV coverage output from the `coverage/` directory as the `unit-test-coverage` workflow artifact.

## Usage

### Grab the Latest Version

```yaml
# ...
steps:
  - name: Install go-task
    uses: jaxxstorm/action-install-gh-release@v1.10.0
    with: # Grab the latest version
      repo: go-task/task
```

### Grab the Latest PreRelease Version

```yaml
# ...
steps:
  - name: Install go-task
    uses: jaxxstorm/action-install-gh-release@v1.10.0
    with: # Grab the latest version
      repo: go-task/task
      prerelease: true
```

### Grab Specific Tags

```yaml
# ...
steps:
  - name: Install tf2pulumi
    uses: jaxxstorm/action-install-gh-release@v1.10.0
    with: # Grab a specific tag
      repo: pulumi/tf2pulumi
      tag: v0.7.0
```

### Verify Download Integrity

When the upstream project publishes stable release digests, pass `digest` so the action verifies
the downloaded asset before extracting or installing it.

```yaml
steps:
  - name: Install promtool with digest verification
    uses: jaxxstorm/action-install-gh-release@v1.10.0
    with:
      repo: prometheus/prometheus
      tag: v2.37.9
      digest: 8740d2371c2a40f8473c80060fae5fd95829982f05095f361c28ac351c15ade8
      platform: linux
      arch: amd64
```

### Grab a Specific Platform And/Or Architecture

```yaml
steps:
  - name: Install tfsec
    uses: jaxxstorm/action-install-gh-release@v1.10.0
    with: # Grab a specific platform and/or architecture
      repo: aquasecurity/tfsec
      platform: linux
      arch: amd64
```

### Grab from a private repository

Use a `repo` scoped [Personal Access Token (PAT)](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token) that has been created on a user with access to the private repository.

```yaml
steps:
  - name: Install private tool
    uses: jaxxstorm/action-install-gh-release@v1.10.0
    with: # Grab from a private repository
      token: ${{ secrets.MY_PAT }}
      repo: my-org/my-private-repo
```

### Caching

This action can use [actions/cache](https://github.com/actions/cache) under the hood. Caching needs to be enabled explicitly and only works for specific tags.

```yaml
# ...
steps:
  - name: Install tf2pulumi
    uses: jaxxstorm/action-install-gh-release@v1.10.0
    with: # Grab a specific tag with caching
      repo: pulumi/tf2pulumi
      tag: v0.7.0
      cache: enable
```

Caching helps avoid
[Rate limiting](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#requests-from-github-actions), since this action does not need to scan tags and releases on a cache hit. Caching currently is not expected to speed up installation.

### Changing Release File Extensions

As described below this action defaults to assuming that a release is either a `.tar.gz` or a `.zip` archive but this
may not always be true for all releases.  For example, a project might release a pure binary, a different archive format, a custom file extension etc.

This action can change its extension-matching behavior via the `extension-matching` and `extension` parameters.  For
example to match on a `.bz2` extension:

```yaml
# ...
jobs:
  my_job:
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} # Github token scoped to job
    steps:
      - name: Install Mozilla grcov
        uses: jaxxstorm/action-install-gh-release@v1.10.0
        with: # Grab a specific file extension
          repo: mozilla/grcov
          tag: v0.8.12
          extension: "\\.bz2"
```

Here the `extension` parameter is used to provide a regular expression for the file extension(s) you want to match.  If
this is not specified then the action defaults to `\.(tag.gz|zip)`.  Since this is a regular expression being embedded into
YAML be aware that you may need to provide an extra level of character escaping, in the above example we have a `\\`
used to escape the backslash and get an actual `\.` (literal match of the period character) in the regular
expression passed into the action.

Alternatively, if a project produces pure binary releases with no file extension then you can install them as follows:

```yaml
# ...
jobs:
  my_job:
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} # Github token scoped to job
    steps:
      - name: Install Open Telemetry Collector Builder (ocb)
        uses: jaxxstorm/action-install-gh-release@v1.10.0
        with: # Grab a pure binary
          repo: open-telemetry/opentelemetry-collector
          tag: v0.62.1
          extension-matching: disable
          rename-to: ocb
          chmod: 0755
```

Note the use of the `rename-to` and `chmod` parameters to rename the downloaded binary and make it executable.

### Grab multiple binaries from a specific location

If the archive of the release contains binaries in a specific location, you can
specify it with the `binaries-location` parameter. Note that the path is
relative to the root of the archive. The option `rename-to` has no effect in
this case. The option `chmod` is applied to all binaries.

```yaml
  - name: Install the latest Wasmer version
    uses: jaxxstorm/action-install-gh-release@v1.10.0
      with:
      repo: wasmerio/wasmer
      binaries-location: bin
      chmod: 0755
```

### Grab a single asset whose name differs from the repository

If the repository's release contains multiplie assets (e.g. for many projects),
you can specify the name of the relevant asset with the `asset-name` parameter.
Binary-related options (i.e. `rename-to`, `chmod`, and `extension-matching`)
can be specified to control whether to treat the asset as binary and/or modify it.

```yaml
  - name: Install the latest wrpc version
    uses: jaxxstorm/action-install-gh-release@v1.10.0
    with:
      repo: bytecodealliance/wrpc
      asset-name: wit-bindgen-wrpc
      rename-to: wit-bindgen-wrpc
      chmod: 0755
      extension-matching: disable
```

<!-- action-docs-inputs source="action.yml" -->
## Inputs

| name | description | required | default |
| --- | --- | --- | --- |
| `token` | <p>GITHUB_TOKEN or a <code>repo</code> scoped Personal Access Token (PAT)</p> | `false` | `${{ github.token }}` |
| `repo` | <p>GitHub repo where binary is located</p> | `true` | `""` |
| `tag` | <p>tag containing binary to install</p> | `true` | `latest` |
| `digest` | <p>SHA256 digest of the release asset. Specify this parameter to verify the integrity of the downloaded asset.</p> | `false` | `""` |
| `prerelease` | <p>Consider prerelease for latest tag</p> | `false` | `false` |
| `platform` | <p>OS Platform to match in release package. Specify this parameter if the repository releases do not follow a normal convention otherwise it will be auto-detected.</p> | `false` | `""` |
| `arch` | <p>OS Architecture to match in release package. Specify this parameter if the repository releases do not follow a normal convention otherwise it will be auto-detected.</p> | `false` | `""` |
| `extension` | <p>Custom file extension to match in release package.  Specify this parameter if the repository releases do not provide a .tar.gz or .zip format release.</p> | `false` | `""` |
| `extension-matching` | <p>Enable/disable file extension matching in release package.  Specify this parameter if the repository releases do not have a file extension e.g. they are pure binaries.</p> | `false` | `enable` |
| `rename-to` | <p>When installing a release that is not an archive, e.g. a pure binary, this controls how the downloaded release asset is renamed.  Specify this parameter if installing a non-archive release.</p> | `false` | `""` |
| `chmod` | <p>When installing a release that is not an archive, e.g. a pure binary, this controls how the downloaded release asset is chmod'd.  Specify this parameter if installing a non-archive release and you need to change its permissions e.g. make it executable.</p> | `false` | `""` |
| `cache` | <p>When set to 'enable', caches the downloads of known tags with actions/cache</p> | `false` | `""` |
| `binaries-location` | <p>Specify this parameter if the binaries are not located in the root of the release archive. The parameter should be a relative path to the release archive. For example, if the binaries are located in the 'bin' directory of the release archive, the parameter should be 'bin'.</p> | `false` | `""` |
| `asset-name` | <p>Use this parameter to specify the name of the asset to download if the repo has multiple assets.</p> | `false` | `""` |
<!-- action-docs-inputs source="action.yml" -->
<!-- action-docs-outputs source="action.yml" -->

<!-- action-docs-outputs source="action.yml" -->

## Security

Please report vulnerabilities privately via GitHub Security Advisories:

https://github.com/jaxxstorm/action-install-gh-release/security/advisories/new

## Finding a release

By default, this action will look up the Platform and Architecture of the runner and use those values to interpolate and match a release package. **The release package name is first converted to lowercase**.

Multiple match patterns are used to find a viable asset:

- Machine Architecture (e.g. `x86_64`, `arm64`, `amd64`)
- (optional) Vendor (e.g. `musl`, `glibc`, `gnu`)
- OS (e.g. `linux`, `darwin`)
- Glibc implementation (e.g. `musl`, `glibc`, `gnu`)
- (optional, via `extension-matching`) Extension (e.g. `tar.gz`, `zip`)

Natively, the action will only match the following platforms (operating systems): `linux`, `darwin`, `windows`.

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
