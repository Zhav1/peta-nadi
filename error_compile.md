#15 [frontend 1/5] FROM docker.io/library/node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293
#15 sha256:4feea04c154301db6f4a496efa397b3db96603b1c009c797cfdde77bea8b3287 14.68MB / 43.23MB 105.4s
#15 sha256:4feea04c154301db6f4a496efa397b3db96603b1c009c797cfdde77bea8b3287 14.68MB / 43.23MB 110.5s
#15 sha256:4feea04c154301db6f4a496efa397b3db96603b1c009c797cfdde77bea8b3287 15.73MB / 43.23MB 115.6s
#15 sha256:4feea04c154301db6f4a496efa397b3db96603b1c009c797cfdde77bea8b3287 16.78MB / 43.23MB 120.7s
#15 ...

#14 [backend 5/7] RUN pip install --no-cache-dir -r requirements.txt
#14 111.2 Collecting msgpack<2.0.0,>=1.1.0 (from langgraph-checkpoint==1.0.12->-r requirements.txt (line 15))
#14 113.8   Downloading msgpack-1.2.1-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl.metadata (8.3 kB)
#14 115.7 Collecting httptools>=0.5.0 (from uvicorn[standard]==0.30.0->-r requirements.txt (line 2))
#14 115.9   Downloading httptools-0.8.0-cp311-cp311-manylinux1_x86_64.manylinux_2_28_x86_64.manylinux_2_5_x86_64.whl.metadata (3.5 kB)
#14 116.8 Collecting pyyaml>=5.1 (from uvicorn[standard]==0.30.0->-r requirements.txt (line 2))
#14 119.3   Downloading pyyaml-6.0.3-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl.metadata (2.4 kB)
#14 ...

#15 [frontend 1/5] FROM docker.io/library/node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293
#15 sha256:4feea04c154301db6f4a496efa397b3db96603b1c009c797cfdde77bea8b3287 17.83MB / 43.23MB 125.8s
#15 sha256:4feea04c154301db6f4a496efa397b3db96603b1c009c797cfdde77bea8b3287 18.87MB / 43.23MB 130.9s
#15 ...

#14 [backend 5/7] RUN pip install --no-cache-dir -r requirements.txt
#14 134.3 ERROR: Exception:
#14 134.3 Traceback (most recent call last):
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_vendor/urllib3/response.py", line 438, in _error_catcher  
#14 134.3     yield
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_vendor/urllib3/response.py", line 561, in read
#14 134.3     data = self._fp_read(amt) if not fp_closed else b""
#14 134.3            ^^^^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_vendor/urllib3/response.py", line 527, in _fp_read        
#14 134.3     return self._fp.read(amt) if amt is not None else self._fp.read()
#14 134.3            ^^^^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/http/client.py", line 478, in read
#14 134.3     s = self.fp.read(amt)
#14 134.3         ^^^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/socket.py", line 718, in readinto
#14 134.3     return self._sock.recv_into(b)
#14 134.3            ^^^^^^^^^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/ssl.py", line 1314, in recv_into
#14 134.3     return self.read(nbytes, buffer)
#14 134.3            ^^^^^^^^^^^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/ssl.py", line 1166, in read
#14 134.3     return self._sslobj.read(len, buffer)
#14 134.3            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#14 134.3 TimeoutError: The read operation timed out
#14 134.3
#14 134.3 During handling of the above exception, another exception occurred:
#14 134.3
#14 134.3 Traceback (most recent call last):
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_internal/cli/base_command.py", line 180, in exc_logging_wrapper
#14 134.3     status = run_func(*args)
#14 134.3              ^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_internal/cli/req_command.py", line 245, in wrapper        
#14 134.3     return func(self, options, args)
#14 134.3            ^^^^^^^^^^^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_internal/commands/install.py", line 377, in run
#14 134.3     requirement_set = resolver.resolve(
#14 134.3                       ^^^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_internal/resolution/resolvelib/resolver.py", line 95, in resolve
#14 134.3     result = self._result = resolver.resolve(
#14 134.3                             ^^^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_vendor/resolvelib/resolvers.py", line 546, in resolve     
#14 134.3     state = resolution.resolve(requirements, max_rounds=max_rounds)
#14 134.3             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_vendor/resolvelib/resolvers.py", line 427, in resolve     
#14 134.3     failure_causes = self._attempt_to_pin_criterion(name)
#14 134.3                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_vendor/resolvelib/resolvers.py", line 239, in _attempt_to_pin_criterion
#14 134.3     criteria = self._get_updated_criteria(candidate)
#14 134.3                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_vendor/resolvelib/resolvers.py", line 230, in _get_updated_criteria
#14 134.3     self._add_to_criteria(criteria, requirement, parent=candidate)
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_vendor/resolvelib/resolvers.py", line 173, in _add_to_criteria
#14 134.3     if not criterion.candidates:
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_vendor/resolvelib/structs.py", line 156, in __bool__      
#14 134.3     return bool(self._sequence)
#14 134.3            ^^^^^^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_internal/resolution/resolvelib/found_candidates.py", line 155, in __bool__
#14 134.3     return any(self)
#14 134.3            ^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_internal/resolution/resolvelib/found_candidates.py", line 143, in <genexpr>
#14 134.3     return (c for c in iterator if id(c) not in self._incompatible_ids)
#14 134.3            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_internal/resolution/resolvelib/found_candidates.py", line 47, in _iter_built
#14 134.3     candidate = func()
#14 134.3                 ^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_internal/resolution/resolvelib/factory.py", line 182, in _make_candidate_from_link
#14 134.3     base: Optional[BaseCandidate] = self._make_base_candidate_from_link(
#14 134.3                                     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_internal/resolution/resolvelib/factory.py", line 228, in _make_base_candidate_from_link
#14 134.3     self._link_candidate_cache[link] = LinkCandidate(
#14 134.3                                        ^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_internal/resolution/resolvelib/candidates.py", line 290, in __init__
#14 134.3     super().__init__(
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_internal/resolution/resolvelib/candidates.py", line 156, in __init__
#14 134.3     self.dist = self._prepare()
#14 134.3                 ^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_internal/resolution/resolvelib/candidates.py", line 222, in _prepare
#14 134.3     dist = self._prepare_distribution()
#14 134.3            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_internal/resolution/resolvelib/candidates.py", line 301, in _prepare_distribution
#14 134.3     return preparer.prepare_linked_requirement(self._ireq, parallel_builds=True)
#14 134.3            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_internal/operations/prepare.py", line 519, in prepare_linked_requirement
#14 134.3     metadata_dist = self._fetch_metadata_only(req)
#14 134.3                     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_internal/operations/prepare.py", line 371, in _fetch_metadata_only
#14 134.3     return self._fetch_metadata_using_link_data_attr(
#14 134.3            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_internal/operations/prepare.py", line 391, in _fetch_metadata_using_link_data_attr
#14 134.3     metadata_file = get_http_url(
#14 134.3                     ^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_internal/operations/prepare.py", line 109, in get_http_url
#14 134.3     from_path, content_type = download(link, temp_dir.path)
#14 134.3                               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_internal/network/download.py", line 147, in __call__      
#14 134.3     for chunk in chunks:
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_internal/network/utils.py", line 63, in response_chunks   
#14 134.3     for chunk in response.raw.stream(
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_vendor/urllib3/response.py", line 622, in stream
#14 134.3     data = self.read(amt=amt, decode_content=decode_content)
#14 134.3            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_vendor/urllib3/response.py", line 560, in read
#14 134.3     with self._error_catcher():
#14 134.3   File "/usr/local/lib/python3.11/contextlib.py", line 158, in __exit__
#14 134.3     self.gen.throw(typ, value, traceback)
#14 134.3   File "/usr/local/lib/python3.11/site-packages/pip/_vendor/urllib3/response.py", line 443, in _error_catcher  
#14 134.3     raise ReadTimeoutError(self._pool, None, "Read timed out.")
#14 134.3 pip._vendor.urllib3.exceptions.ReadTimeoutError: HTTPSConnectionPool(host='files.pythonhosted.org', port=443): Read timed out.
#14 135.7 
#14 135.7 [notice] A new release of pip is available: 24.0 -> 26.1.2
#14 135.7 [notice] To update, run: pip install --upgrade pip
#14 ERROR: process "/bin/sh -c pip install --no-cache-dir -r requirements.txt" did not complete successfully: exit code: 2

#15 [frontend 1/5] FROM docker.io/library/node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293
#15 sha256:4feea04c154301db6f4a496efa397b3db96603b1c009c797cfdde77bea8b3287 18.87MB / 43.23MB 136.5s
#15 DONE 136.5s

#16 [frontend 2/5] WORKDIR /app
#16 CANCELED
------
 > [backend 5/7] RUN pip install --no-cache-dir -r requirements.txt:
134.3   File "/usr/local/lib/python3.11/site-packages/pip/_vendor/urllib3/response.py", line 560, in read
134.3     with self._error_catcher():
134.3   File "/usr/local/lib/python3.11/contextlib.py", line 158, in __exit__
134.3     self.gen.throw(typ, value, traceback)
134.3   File "/usr/local/lib/python3.11/site-packages/pip/_vendor/urllib3/response.py", line 443, in _error_catcher      
134.3     raise ReadTimeoutError(self._pool, None, "Read timed out.")
134.3 pip._vendor.urllib3.exceptions.ReadTimeoutError: HTTPSConnectionPool(host='files.pythonhosted.org', port=443): Read timed out.
135.7
135.7 [notice] A new release of pip is available: 24.0 -> 26.1.2
135.7 [notice] To update, run: pip install --upgrade pip
------
[+] up 0/2
 - Image peta-nadi-backend  Building                                                                               142.1s
 - Image peta-nadi-frontend Building                                                                               142.1s
Dockerfile:20

--------------------

  18 |     # Copy requirements from backend directory and install dependencies

  19 |     COPY backend/requirements.txt .

  20 | >>> RUN pip install --no-cache-dir -r requirements.txt

  21 |

  22 |     # Copy backend files to /app

--------------------

target backend: failed to solve: process "/bin/sh -c pip install --no-cache-dir -r requirements.txt" did not complete successfully: exit code: 2


What's next:
    Debug this Compose error with Gordon → docker ai "help me fix this compose error"
PS C:\Farras\DIGDAYA\peta-nadi> 