# 3D support tool

Create apng thumbnails from the input glb file.

## Usage

- Place the glb file that will be the input for public.
- Please start up the server.
```bash
http-server ./public --cors
```
- Converts the glb specified as public to a path.
```
node index.js 'http://127.0.0.1:8080/sample.glb'
```