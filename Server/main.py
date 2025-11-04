"""
PyPyC2 Server - Command and Control Server (Main Entry Point)
Manages agent connections, command execution, file transfers, and payload generation.

This is the main application file that brings together all routers and middleware.
"""

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import auth, agents, commands, agent_comms, files, payloads


# =============================================================================
# FASTAPI APPLICATION SETUP
# =============================================================================

app = FastAPI(
    title="PyPyC2 Server",
    description="Command and Control Server for PyPyC2 Framework",
    version="1.0.0"
)

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# INCLUDE ROUTERS
# =============================================================================

# Authentication routes
app.include_router(auth.router)

# Dashboard & Admin routes
app.include_router(agents.router)

# Command Management routes
app.include_router(commands.router)

# Agent Communication routes (special handling for /join without prefix)
# Register /join route without prefix
app.post("/join", tags=["agent-communication"])(agent_comms.create_agent)
# Include the rest with prefix
app.include_router(agent_comms.router)

# File Management routes
app.include_router(files.router)

# Payload Generation routes
app.include_router(payloads.router)


# =============================================================================
# APPLICATION ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
