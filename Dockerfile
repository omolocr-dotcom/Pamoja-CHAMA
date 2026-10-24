# Used only if the host builds from a Dockerfile. Hosts that read package.json will run "npm start" instead.
FROM node:22-alpine
WORKDIR /app
COPY . .
# Stops the build with a clear message if any website file was left out of the repository.
RUN node server.js --check
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "server.js"]
