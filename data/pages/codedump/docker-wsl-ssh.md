# Docker on WSL with SSH

## Motive

Are you hosting a server or developing in Windows, and wanting an environment
and experience that are similar to Linux? Well, this system gives you that and
lets you work remotely with the environment via SSH (and even via VNC?!).

The setup procedure for each components are not straightforward and require
quite a bit of discovery and troubleshooting. This write-up hopefully serves as
a helpful guide for anyone who wants to set up any part of the system.

This write-up splits into five sections:
- Windows Subsystem for Linux
- SSH on Windows
- Docker on WSL and Firewall
- Extra perks
- Conclusion

Footnotes denote alternate commandline options, or the command to be run when no
GUI option is available, they should be run in elevated Powershell. Anything
enclosed in angle brackets must be customized for each system.

> ⚠ __Pitfall:__
> **You must understand what each command and step do before running them, do**
> **not blindly follow instructions from the Internet for performing**
> **administrative tasks.**

## Windows Subsystem for Linux

### Setting up WSL

Here are the procedures to set up WSL and avoid common error messages:

1. Install `Ubuntu` from the Microsoft Store.
2. Go to `Settings > Apps > Optional features > Related settings`
   `> More Windows features` or `Control Panel > Programs and Features`
   `> Turn Windows features on or off`, tick `Windows Subsystem for Linux`,
   and click `OK`[^1] (solves error `0x8007019e`).
3. Restart computer to enter BIOS and enable virtualization[^2]
   (solves error `0x80370102`).
4. Start the computer to complete the installation, choosing a suitable username
   for within WSL.

> ⚠ __Pitfall:__
> A restart is required after enabling the `Windows Subsystem for Linux`
> Windows feature, even if the installation complete screen is reassuring.

[^1]: `wsl --install`
[^2]: `Restart-Computer `

## SSH on Windows

### Setting up the server

Go to `Settings > Apps > Optional features > Add a feature`, tick
`OpenSSH Server` and click install.[^3]

It can be tested by starting the SSH server[^4], and login using any SSH
clients[^5].

> ⚠ __Pitfall:__
> Username used for the SSH connections should be the name of the user's home
> directory, which is `C:\Users\<username>`, and may not be the username in WSL
> or the display name on the login screen.

Settings for the SSH server such as setting `Port` to any value that is not `22`
can be modified in `C:\ProgramData\ssh\sshd_config`[^6]. The configuration for
public key authentication is difficult and will be discussed in the following
section.

The relevant inbound firewall rule should be set automatically.

> 🗒️ _Note:_
> It is possible to install `openssh-server` in WSL. But due to the difference
> of security model between Windows and Linux, it is easier to obtain
> administrative right this way.
>
> There is a tool called `wudo`, which prompts for elavated process each time,
> it is good for running commands locally, not suitable for remote access.

[^3]: `Add-WindowsCapability -Online -Name OpenSSH.Server`
[^4]: `Start-Service sshd`
[^5]: `ssh <username>@localhost`
[^6]: ``Add-Content -Path C:\ProgramData\ssh\sshd_config -Value "`nPort <port_number>"``

### Using public key authentication instead

With an SSH server exposed to the network for remote connection, it is essential
for it to be secured. One way is to use public key authentication instead of
password authentication. It is configured in the `C:\ProgramData\ssh` directory.

> ⚠ __Pitfall:__
> There may be a `.ssh` directory in the current user's home directory, but
> putting `authorized_keys` in administrators' home directories has no effect.
>
> **By performing the following steps, you allow anyone who have an entry in**
> **the `administrators_authorized_keys` file to log in to the computer with**
> **administrative right. You should only continue if you are the sole owner**
> **of the computer and the key, and understand the security implication.**

1. Edit `sshd_config` to set `PasswordAuthentication` to `no` and
   `PubkeyAuthentication` to `yes`.[^7]
2. Restart the server to apply the configuration change.[^8]
3. Create `administrators_authorized_keys`, and append the public key.[^9]
4. (Optional) Attempt to connect to the server, and be disappointed by the
   `Permission denied` message.
5. Right click on `administrators_authorized_keys` and go to `Properties >`
   `Security > Advanced > Change permissions > Disable inheritance`. Select
   `Convert inherited permissions into explicit permissions on this object.`
   when prompted.[^10]
6. Click to select the row with `Authenticated Users` as `Principal`, and click
   `Remove` to remove the permission for the user group. Click `OK` until all
   dialogs are dismissed.[^11]

The server should now be able to read the `administrators_authorized_keys` file
properly, and allow public key authentication. The steps are there to prevent
unauthorized users from reading the public key file, similar to the function of
the `chmod` command in Unix systems.

> 🗒️ _Note:_
> Sometimes more logging may be desired for debugging connections to an SSH
> server. Two options can be added to `sshd_config`: `SyslogFacility LOCAL0` and
> `LogLevel DEBUG3`[^12]. Then, all logs can be grokked in
> `C:\ProgramData\ssh\logs\sshd.log`.
>
> For exmaple, if steps 5 and 6 are not performed, the following error will be
> logged:
> `Bad permissions. Try removing permissions for user: `
> `NT AUTHORITY\\Authenticaed Users (S-1-5-11) on file `
> `C:/ProgramData/ssh/administrators_authorized_keys.`
>
> And if they are not done properly:
> `Failed to open file:C:/ProgramData/ssh/administrators_authorized_keys `
> `error:13`

[^7]: ``Add-Content -Path C:\ProgramData\ssh\sshd_config -Value "`nPasswordAuthentication no`nPubkeyAuthentication yes"``
[^8]: `Restart-Service sshd`
[^9]: ``Add-Content -Path C:\ProgramData\ssh\administrators_authorized_keys -Value "`n$(Get-Clipboard)"``
[^10]: This will be performed altogether in the command for the next step.
[^11]: `icacls.exe C:\ProgramData\ssh\administrators_authorized_keys /inheritance:r /grant 'Administrators:F' /grant 'SYSTEM:F'`
[^12]: ``Add-Content -Path C:\ProgramData\ssh\sshd_config -Value "`nSyslogFacility LOCAL0`nLogLevel DEBUG3"``

### Directing log-ins to WSL

Thus far, logging in using SSH directs user to the command prompt, which is not
ideal for a seamless Linux like environment. Of course, it is possible to start
shells in WSL automatically by supplying additional arguments when using SSH.
This section adds configurations so that no additional arguments are needed.

> 🗒️ _Note:_
> To enter an administrative Powershell session, `powershell.exe` is the command
> to start it, not `powershell`. An alias can be made in the WSL user's shell to
> point `powershell` to `powershell.exe`. Other Windows system executables are
> similar.

See footnote[^13] for one command solution for all listed steps below. The steps
configures the redirections for one user.

1. Press `⊞ Win`+`R` keys to open the run prompt.
2. Type in `regedit`, click `OK`, and provide administrative right.
3. Navigate to `Computer\HKEY_CURRENT_USER\SOFTWARE\OpenSSH` and right click the
   `OpenSSH` directory.
4. Select `New` and `String Value`, and enter `DefaultShell` as the name.
5. Right click the newly created value and select `Modify...`, enter
   `C:\Users\<username>\AppData\Local\Microsoft\WindowsApps\ubuntu.exe` as its
   value data, and click `OK` to confirm.
6. The SSH server is now configured to direct log-ins to WSL.

> 🗒️ _Note:_
> In the first setup performed, `C:\Windows\System32\bash.exe` was used instead
> of `ubunutu.exe`. This setting is shell oriented,and poses some pros and cons.
>
> Pros:
> - It gives a nice prompt if no distros are installed
> - The setting is not specific to one user
>
> Cons:
> - The `chsh` command does not work with this approach and a `.bashrc` hack is
>   needed
> - Using a different shell requires stacking on top of Bash, which is not ideal
>
> As this write-up assumes the setup is for one user only, and so the deployment
> convenience is hardly relevant. Ultimately, `ubuntu.exe` is chosen instead.

[^13]: `New-ItemProperty -Path 'HKCU:\SOFTWARE\OpenSSH' -Name DefaultShell -Value 'C:\Users\<username>\AppData\Local\Microsoft\WindowsApps\ubuntu.exe' -PropertyType String -Force`

## Docker on WSL and Firewall

### Installation

Docker relies on WSL to run on Windows, so it is quite straight-forward to
install Docker after setting up WSL. It also provides an extensionless command
`docker` within WSL.

### Allowing inbound connections

Unlike within Linux where a user can use `iptables` to configure port access for
all processes, target program must also be considered when allowing inbound
connections in Windows. The following steps ensures that only the correct port
and program accept inbound connections[^14]:

1. Go to `Windows Security > Firewall & network protection >`
   `Advanced settings`, and provide administrative right.
2. Select `Inbound Rules` in the side menu on the left, and click `New Rule...`
   in the side menu on the right, a setup wizard should appear.
3. Continue with the below steps, clicking `Next` or `Finish` after each step:
   1. Select `Custom` to specify both the program and the ports.
   2. Select `This program path:` to restrict the scope of the rule and put in
      `C:\Program File\Docker\Docker\resources\com.docker.backend` as the path.
   3. Select the protocol and ports for the connection to pass through.
   4. Select `Allow the connection`, see note for the reason.
   5. Select on which types of network does the firewall allow connections,
      preferably only `Private`.
   6. Choose an appropiate name for the rule.
4. Repeat the procedure for each different protocols.

> 🗒️ _Note:_
> There are settings such as `Allow an app through firewall` that authorize
> connections on a per-app basis. This works fine for applications like game
> servers where only a few ports are opened and those are intended to be exposed
> through the firewall. But for Docker, large amount of ports may be opened to
> communicate with the host and are not intended to be exposed, so a stricter
> mechanism is preferred.
>
> The `Allow the connection if it is secure` option uses IPsec which requires
> additional setup on the client-side, so most servers use the plain Internet
> Protocol (IP) and authenticate on a higher level. Here, `Allow the connection`
> option specifies this.

[^14]: `New-NetFirewallRule -DisplayName '<name>' -Program 'C:\Program Files\Docker\Docker\resources\com.docker.backend.exe' -Authentication NotRequired -Protocol <protocol> -LocalPort <ports>`

## Extra perks

### Remote desktop on Windows

With the above setup, a container can be set up to run a full-fledged desktop
environment, then connect remotely with VNC to be used as a remote desktop.

Here is the [Dockerfile][Dockerfile] for a minimum desktop environment setup.
See comments in the file for configuration detail. Execute this command[^15] to
tunnel the remote VNC port, and connect to `localhost:5900` using a VNC client.

[Dockerfile]: /codedump/dockerfiles/xserver.dockerfile.html
[^15]: `ssh -L 5900:<ip_addr>:5900 <username>@<ip_addr> 'docker run --rm -p 5900:5900 <image_name>'`

### Thoughts on external peripherals and devices

Currently, WSL does not have access to external peripherals and devices. The
workaround is to access the input through streaming. This is quite cumbersome
and is one of the major roadblock for wider adoption in my opinion.

## Conclusion

Docker on WSL provides a Linux reproducible deployment environment in Windows.
This makes developing and testing softwares on Windows more usable for users who
are familiar with the convenient Linux environment. The new WSLg feature for the
new Windows version also allow to run a GUI Linux application using an internal
VNC client, which can be emulated by using a separate client.

Although this is a huge breakthrough for software development and system
deployment in Windows, WSL is still quite restrictive and a lot less powerful
than a full Linux environment. It may not be able to replace typical Linux
environments, but it is quite handly on occasion.
