### Demonstration Information

#### Where do my data go when I am using the demos?

- All data are stored on the browser temporarily,
  they will be cleared when your browser is closed.
- As this is a static site, hosted by [Gitlab Pages][pages],
  no data can be stored on the server.
- Some APIs do not accept brower requests, and so [CORS-Anywhere][cors]
  service is used sometimes.
- Additional usage can be viewed on individual project's README.

If you do not wish to send your data:

- to my website for processing, download to use the individual project.
- through CORS-Anywhere usage, please download the project
  and host it with a local server, or executing it offline if possible.
- to any other parties stated on the project's README,
  please do not use the demo or project.

#### How can I protect my data when I am using the demos?

1. Use a disposable rate-limited API key.
1. Avoid using sensitive data on the site.

#### How do these demos work?

Most projects are minimally patched to work on this static site,
Getinfo CSharp also uses [Blazor.NET][blazor] as a compatibility layer.

[pages]: https://about.gitlab.com/stages-devops-lifecycle/pages/
[cors]: https://cors-anywhere.herokuapp.com/
[blazor]: https://blazor.net/
