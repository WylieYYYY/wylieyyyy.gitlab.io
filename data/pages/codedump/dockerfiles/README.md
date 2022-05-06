# Dockerfiles

A collection of useful Dockerfiles by me, nothing special.

A [write-up][writeup] is available for Windows users, detailing the installation
process and the potential pitfalls.

## User guide for each Dockerfile

Descriptions and configuration detail are available in subsections, all
Dockerfiles can be built using `docker build -t <repository> -f <filename> .`.

### android.dockerfile

Provides a build environment for Android applications, Gradle daemon takes some
time to start when using a new container instance. Also exposes port 5037 for
ADB, ADB pairing is kept persistent via the file `config/adbkeys.tar.gz`.

This Dockerfile has three configuration arguments:

- `ANDROID_HOME`: The directory to install Android SDK, change unlikely needed.
- `sdk_tools_version`: Command-line tools' version, used to be called SDK tools.
  Manages Android SDK, platform tools, and build tools installtions. The version
  string is in the download link on [Android's website][cmdline_tools_download].
- `build_tools_version`: Build tools' version, modify this to add support for
  building with newer API levels.

[cmdline_tools_download]: https://developer.android.com/studio

#### Procedures to obtain `adbkeys.tar.gz`

Connect to the target device using ADB once. This image can be used in lieu of a
separate installation, remember to comment out the following lines from the file
before building for this purpose:

```dockerfile
ADD config/adbkeys.tar.gz /root/.android
RUN chmod 600 /root/.android/adbkey*
```

After pairing fot the first time, the keypair `adbkey` and `adbkey.pub` are
generated in `$HOME/.android`. Package them in a `.tar.gz` called
`adbkeys.tar.gz` without wrapping them in a new directory. Place it in a
directory called `config` next to the Dockerfile to make ADB pairing persistent.

### torhost.dockerfile

Hosts a hidden service on the Tor network, hostname persistent is kept via the
file `config/hidden_service.tar.gz`. Hosting doesn't require any port forwarding
and can be configured to listen on and broadcast to any port.

This Dockerfile has two configuration arguments:

- `hidden_service_dir`: The directory to store the information and keypair,
  change unlikely needed.
- `service_port`: The port of the service if the local port and the foreign
  ports are the same. Or in the form of `<local_port> 127.0.0.1:<foreign_port>`.

#### Procedures to obtain `hidden_service.tar.gz`

Start the onion service once. This image can be used in lieu of a separate
installation, remember to comment out the following lines from the file before
building for this purpose:

```dockerfile
WORKDIR "$hidden_service_dir"
ADD config/hidden_service.tar.gz .
RUN chown -R tor:nogroup . && chmod 700 . && chmod 600 ./*
```

After starting for the first time, the keypair `hs_ed25519_secret_key` and
`hs_ed25519_public_key`, and the `hostname` file are generated in the directory
with the path indicated by the configuration argument `hidden_service_dir` (the
default is `/var/lib/tor/hidden_service`). Package them in a `.tar.gz` called
`hidden_service.tar.gz` without wrapping them in a new directory. Place it in a
directory called `config` next to the Dockerfile to make hostname persistent.

### xserver.dockerfile

Starts a configurable script with Xvfb (X virtual framebuffer) connected to a
VNC server. The server by default uses port 5900. This aims to provide a minimal
GUI Linux environment, and can provide a dedicated workspace for projects when
combined with the bind mount functionality. The [write-up][writeup] contains the
command for port tunneling and starting the container.

This Dockerfile has only one configuration argument:

- `resolution`: Sets the resolution and colour depth of the virtual framebuffer.

Additional file-based configuration are described below.

#### File-based configuration

All files in the directory `config/dotfiles` will be copied to `/root`.
Additionally, the following two files within the directory will have special
semantic, they do not need to be executable:

- `.desetup`: Script to install packages and copy default configuration files,
  is run before the remaining dotfiles are copied over.
- `.xinitrc`: This is the first script run when the container is started.

[writeup]: /codedump/docker-wsl-ssh.md.html
