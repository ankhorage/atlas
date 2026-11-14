###
### Project (required)
###

# Absolute path to the project root
NEXT_PUBLIC_PROJECT_PATH=

###
### Settings (optional)
###

# boolean @default true
NEXT_PUBLIC_SETTINGS_SHOW_COMPOUNDNODES=true
# Browser cycle highlights: persisted per-project choices override this default.
NEXT_PUBLIC_SETTINGS_SHOW_CYCLES=false

# boolean @default false
NEXT_PUBLIC_SETTINGS_SHOW_VENDORPACKAGES=false

# 'breadthfirst' | 'circle' | 'concentric' | 'elk' | 'grid' @default 'concentric'
NEXT_PUBLIC_SETTINGS_LAYOUT=concentric

# number @default 1 @min 0.1 @max 1 @step 0.1
NEXT_PUBLIC_SETTINGS_LAYOUT_SPACING=1

# number @default 1
NEXT_PUBLIC_SETTINGS_SUBPACKAGE_DEPTH=1

###
### GitHub OAuth (production only)
###

# The existing Ankhorage GitHub OAuth App client credentials. Do not expose either value as NEXT_PUBLIC_*.
ATLAS_GITHUB_OAUTH_CLIENT_ID=
ATLAS_GITHUB_OAUTH_CLIENT_SECRET=

# Trusted server module that provides durable, encrypted-at-rest, user-isolated OAuth attempt and
# session storage. It must atomically consume attempts and bind them to the opaque session id.
ATLAS_GITHUB_AUTH_PERSISTENCE_MODULE=

# Register exactly this callback in the GitHub OAuth App:
# https://atlas.ankhorage.com/api/auth/github/callback
# Private repository inventory requires explicit user consent to the GitHub `repo` scope; it also
# grants write access, so organization OAuth approval and installation/SSO restrictions still apply.
