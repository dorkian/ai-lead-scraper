import uvicorn
import sys

if __name__ == "__main__":
    reload = "--reload" in sys.argv or "-r" in sys.argv
    uvicorn.run("api.app:app", host="0.0.0.0", port=3252, reload=reload)
