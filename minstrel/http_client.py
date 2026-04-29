from aiohttp import ClientSession

class HTTPClient:
    def __init__(self):
        self.session = None

    async def start_session(self):
        if self.session is None or self.session.closed:
            self.session = ClientSession()

    async def close_session(self):
        if self.session and not self.session.closed:
            await self.session.close()
            self.session = None

    async def get(self, url, headers=None, params=None):
        await self.start_session()
        try:
            async with self.session.get(url, headers=headers, params=params) as response:
                response.raise_for_status()
                return await response.json()  # Assuming JSON response, modify as needed
        except Exception as e:
            raise e

    async def post(self, url, headers=None, json=None):
        await self.start_session()
        try:
            async with self.session.post(url, headers=headers, json=json) as response:
                response.raise_for_status()
                return await response.json()  # Assuming JSON response, modify as needed
        except Exception as e:
            raise e

    async def post_stream(self, url, headers=None, json=None):
        await self.start_session()
        try:
            response = await self.session.post(url, headers=headers, json=json)
            response.raise_for_status()
            return response
        except Exception as e:
            # If there's an error during the request, ensure the session is still properly managed
            raise e

http_client = HTTPClient()
