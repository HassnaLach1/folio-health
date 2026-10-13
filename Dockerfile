FROM node:24-bookworm-slim AS build

WORKDIR /app
RUN npm install --global pnpm@11.25.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Expo embeds public settings in the web bundle at build time.
ARG EXPO_PUBLIC_SUPABASE_URL=
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY=
ARG EXPO_PUBLIC_REQUIRE_MFA=true
ARG EXPO_PUBLIC_DOCTOR_VIEW_URL=
ENV EXPO_PUBLIC_SUPABASE_URL=${EXPO_PUBLIC_SUPABASE_URL} \
    EXPO_PUBLIC_SUPABASE_ANON_KEY=${EXPO_PUBLIC_SUPABASE_ANON_KEY} \
    EXPO_PUBLIC_REQUIRE_MFA=${EXPO_PUBLIC_REQUIRE_MFA} \
    EXPO_PUBLIC_DOCTOR_VIEW_URL=${EXPO_PUBLIC_DOCTOR_VIEW_URL}
RUN pnpm build:web

FROM nginx:stable-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
