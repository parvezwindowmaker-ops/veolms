// VeoLMS CI/CD — backend + frontend, single-server deploy.
//
// Model: Jenkins itself runs INSIDE a Docker container and drives the HOST's
// Docker daemon (Docker-out-of-Docker — the host's /var/run/docker.sock is
// mounted into Jenkins). The pipeline builds each service's image and (re)runs it
// as a sibling container on the host. No registry, no remote SSH.
//
// Frontend: a static Vite SPA. It is BUILT via docker build (frontend/Dockerfile)
// and the compiled files are copied onto the host's own nginx web root — nginx is
// configured/served separately on the host, not by this pipeline. VITE_* vars are
// inlined at BUILD time, so the API base URL is passed as --build-arg VITE_API_URL.
//
// Key consequence: the docker DAEMON is the host's, so anything the daemon
// resolves (`-v` bind mounts, `-p`, `--add-host`, `--restart`) refers to the
// HOST filesystem/network — but the docker CLI's own file reads (`--env-file`,
// build context) come from INSIDE the Jenkins container. The runtime env file
// lives on the host (outside Jenkins), so we bind-mount it into the app container
// instead of using `--env-file` (which the CLI would look for inside Jenkins and
// not find).
//
// Prerequisites (one-time):
//   - Jenkins container started with the host socket + a docker CLI available, e.g.:
//       docker run -d --name jenkins \
//         -v /var/run/docker.sock:/var/run/docker.sock \
//         -v jenkins_home:/var/jenkins_home \
//         <jenkins-image-with-docker-cli>
//     (the jenkins user must be allowed to use the socket — match the host docker GID).
//   - /opt/veolms/.env exists ON THE HOST (KEY=VALUE lines: JWT_SECRET,
//     POSTGRES_*/DATABASE_URL + DATABASE_SSL, REDIS_URL, R2_*, RAZORPAY_*, ...).
//     The app loads it via dotenv at startup; it is never baked into the image.
//
// Redis/Postgres: the app container reaches host services via host.docker.internal
// (mapped below) — e.g. REDIS_URL=redis://host.docker.internal:6379 if Redis runs
// on the host. Postgres is Neon (managed), so DATABASE_SSL=true.

pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    timeout(time: 20, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '10'))
  }

  environment {
    IMAGE      = 'veolms-backend'
    CONTAINER  = 'veolms-backend'
    PORT       = '5005'             // host + container port on the server
    BUILD_CTX  = 'backend'          // Dockerfile lives in ./backend
    ENV_FILE   = '/opt/veolms/.env' // runtime config on the server

    // Frontend (static SPA — built here, served by the host's own nginx).
    FE_IMAGE      = 'veolms-frontend'
    FE_BUILD_CTX  = 'frontend'                          // Dockerfile lives in ./frontend
    FE_DEPLOY_DIR = '/opt/veolms/web'                   // host nginx web root — set to yours
    VITE_API_URL  = 'https://ptmsoftware.me/veolms-api' // baked into the build
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Build backend image') {
      steps {
        // The Dockerfile already runs `tsc` in its build stage, so a type error
        // here fails the build (that's our compile gate). Tag with the build
        // number for traceability/rollback, plus a moving :latest.
        sh '''
          set -e
          docker build -t "$IMAGE:$BUILD_NUMBER" -t "$IMAGE:latest" "$BUILD_CTX"
        '''
      }
    }

    stage('Deploy backend') {
      steps {
        sh '''
          set -e
          # This shell runs inside the Jenkins container and can't see the host FS,
          # so verify the host env file via a throwaway container (daemon-resolved
          # mount of its directory). A missing dir would mount empty, so test the file.
          ENV_DIR=$(dirname "$ENV_FILE")
          ENV_NAME=$(basename "$ENV_FILE")
          docker run --rm -v "$ENV_DIR":/host:ro alpine test -f "/host/$ENV_NAME" \
            || { echo "ERROR: $ENV_FILE not found on the host"; exit 1; }

          # Replace the running container with the freshly built image. The host
          # env file is bind-mounted to /app/.env (the app loads it via dotenv);
          # PORT is pinned so the listen port matches the published port.
          docker rm -f "$CONTAINER" 2>/dev/null || true

          docker run -d \
            --name "$CONTAINER" \
            -v "$ENV_FILE":/app/.env:ro \
            -e PORT="$PORT" \
            -p "$PORT:$PORT" \
            --add-host=host.docker.internal:host-gateway \
            --restart unless-stopped \
            "$IMAGE:$BUILD_NUMBER"
        '''
      }
    }

    stage('Verify backend') {
      steps {
        // Wait for the app to report ready. The backend connects to Postgres
        // (and seeds on an empty DB) before it logs "listening on port", so a
        // few retries cover startup. Fail loudly if the container exits early.
        sh '''
          set -e
          ready=0
          for i in $(seq 1 20); do
            state=$(docker inspect -f "{{.State.Running}}" "$CONTAINER" 2>/dev/null || echo missing)
            if [ "$state" != "true" ]; then
              echo "Container is not running (state=$state). Recent logs:"
              docker logs --tail 120 "$CONTAINER" 2>/dev/null || true
              exit 1
            fi
            if docker logs "$CONTAINER" 2>&1 | grep -q "listening on port"; then
              ready=1
              break
            fi
            sleep 3
          done
          if [ "$ready" != "1" ]; then
            echo "App did not become ready in time. Recent logs:"
            docker logs --tail 120 "$CONTAINER"
            exit 1
          fi
          echo "Deployed and healthy:"
          docker ps --filter "name=$CONTAINER"
        '''
      }
    }

    stage('Build frontend image') {
      steps {
        // Vite inlines VITE_API_URL at build time (passed as a build-arg) and the
        // Dockerfile runs `tsc -b && vite build`, so a type error fails the build.
        sh '''
          set -e
          docker build \
            --build-arg VITE_API_URL="$VITE_API_URL" \
            -t "$FE_IMAGE:$BUILD_NUMBER" -t "$FE_IMAGE:latest" "$FE_BUILD_CTX"
        '''
      }
    }

    stage('Publish frontend') {
      steps {
        // Copy the freshly built static files onto the host's nginx web root.
        // Jenkins can't see the host FS directly, so we hop through a throwaway
        // container: the -v mount is resolved by the HOST daemon, so /out is the
        // HOST directory. The build image just carries /dist (no server).
        sh '''
          set -e
          # Fail early if the target web root doesn't exist on the host (a missing
          # dir would otherwise be auto-created as an empty root-owned mount).
          DEPLOY_PARENT=$(dirname "$FE_DEPLOY_DIR")
          DEPLOY_NAME=$(basename "$FE_DEPLOY_DIR")
          docker run --rm -v "$DEPLOY_PARENT":/host:ro alpine test -d "/host/$DEPLOY_NAME" \
            || { echo "ERROR: $FE_DEPLOY_DIR not found on the host"; exit 1; }

          # Clear the old build, then copy the new one in (dotfiles included).
          docker run --rm -v "$FE_DEPLOY_DIR":/out "$FE_IMAGE:$BUILD_NUMBER" \
            sh -c 'rm -rf /out/* && cp -a /dist/. /out/'
        '''
      }
    }

    stage('Verify frontend') {
      steps {
        // Confirm the entry file actually landed on the host web root. Serving is
        // the host nginx's job, so there's no container/port to health-check here.
        sh '''
          set -e
          docker run --rm -v "$FE_DEPLOY_DIR":/out:ro alpine test -f /out/index.html \
            || { echo "ERROR: index.html missing in $FE_DEPLOY_DIR after publish"; exit 1; }
          echo "Frontend published to $FE_DEPLOY_DIR (served by host nginx)."
        '''
      }
    }
  }

  post {
    success {
      // Drop dangling images so repeated builds don't fill the disk.
      sh 'docker image prune -f >/dev/null 2>&1 || true'
      echo "Deployed backend $IMAGE:$BUILD_NUMBER on port $PORT; frontend published to $FE_DEPLOY_DIR."
    }
    failure {
      sh 'docker logs --tail 80 "$CONTAINER" 2>/dev/null || true'
    }
  }
}
