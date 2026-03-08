### Requirements

- Docker 24+
- Docker Compose v2+
- Make (installed by default on macOS/Linux)

## 🛠 First time setup
```bash
   make init
```
##  Regular dev run
```bash
   make dev
```

# Other Commands

## Start production-like stack
```bash
  make prod
```
# Run database migrations (one-off)
```bash
  make migrate
```
# Run seed (one-off)
```bash
  make seed
```


# Reset database (removes volumes!)
```bash
  make reset
```

## 6.3 Non-root verification

### Prod image

The runtime container is configured to run as a non-root user (`USER node`).

```bash
docker compose run --rm api id 
```
Expected output:

~~~
uid=1000(node) gid=1000(node)
~~~

## Docker image optimization evidence

```bash
$ docker image ls --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}' | grep '^nest-js'
nest-js       prod-distroless   866fd18e6e5c   301MB
nest-js       prod              3188da54531d   317MB
```

```bash
$ docker history nest-js:prod | head -n 8
IMAGE          CREATED        CREATED BY                                      SIZE      COMMENT
3188da54531d   38 hours ago   CMD ["node" "dist/main.js"]                     0B        buildkit.dockerfile.v0
<missing>      38 hours ago   EXPOSE [3000/tcp]                               0B        buildkit.dockerfile.v0
<missing>      38 hours ago   COPY --chown=node:node package*.json ./ # bu…   563kB     buildkit.dockerfile.v0
<missing>      38 hours ago   COPY --chown=node:node /usr/src/app/dist ./d…   265kB     buildkit.dockerfile.v0
<missing>      38 hours ago   COPY --chown=node:node /usr/src/app/node_mod…   153MB     buildkit.dockerfile.v0
<missing>      38 hours ago   USER node                                       0B        buildkit.dockerfile.v0
<missing>      38 hours ago   ENV NODE_ENV=production                         0B        buildkit.dockerfile.v0
```

```bash
$ docker history nest-js:prod-distroless | head -n 8
IMAGE          CREATED        CREATED BY                                      SIZE      COMMENT
866fd18e6e5c   38 hours ago   CMD ["dist/main.js"]                            0B        buildkit.dockerfile.v0
<missing>      38 hours ago   EXPOSE [3000/tcp]                               0B        buildkit.dockerfile.v0
<missing>      38 hours ago   COPY /usr/src/app/package*.json ./ # buildkit   562kB     buildkit.dockerfile.v0
<missing>      38 hours ago   COPY /usr/src/app/dist ./dist # buildkit        265kB     buildkit.dockerfile.v0
<missing>      38 hours ago   COPY /usr/src/app/node_modules ./node_module…   153MB     buildkit.dockerfile.v0
<missing>      38 hours ago   ENV NODE_ENV=production                         0B        buildkit.dockerfile.v0
<missing>      39 hours ago   WORKDIR /usr/src/app                            0B        buildkit.dockerfile.v0
```

`prod-distroless` is smaller (`301MB` vs `317MB`) because the runtime base is stripped down and excludes shell/package-manager tooling.
It is also more secure by default due to the distroless non-root runtime and reduced attack surface.
