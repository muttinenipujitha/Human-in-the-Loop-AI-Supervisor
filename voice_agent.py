


import os
import inspect


from livekit import api

LIVEKIT_URL = os.environ.get("LIVEKIT_URL", "")
LIVEKIT_API_KEY = os.environ.get("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.environ.get("LIVEKIT_API_SECRET", "")

def check_livekit_config() -> bool:
    return bool(LIVEKIT_URL and LIVEKIT_API_KEY and LIVEKIT_API_SECRET)

def _try_create_with_constructor(AccessTokenCls, identity, ttl_seconds):
    """
    Try constructing AccessToken using a constructor signature that accepts
    identity/ttl kwargs (some versions accept ttl or identity).
    """
    try:
        sig = inspect.signature(AccessTokenCls)
        kwargs = {}
        if 'identity' in sig.parameters:
            kwargs['identity'] = identity
        if 'ttl' in sig.parameters:
            kwargs['ttl'] = ttl_seconds
        
        return AccessTokenCls(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, **kwargs)
    except Exception:
        
        return None

def create_token(identity: str, room: str, ttl_seconds: int = 1200) -> str:
    """Generate an access token for joining a LiveKit room (robust across versions)."""
    if not check_livekit_config():
        raise RuntimeError("Missing LiveKit env vars")

    AccessToken = getattr(api, "AccessToken", None)
    VideoGrants = getattr(api, "VideoGrants", None)

    if AccessToken is None:
        raise RuntimeError("livekit.api.AccessToken not found in installed package")

    
    at = _try_create_with_constructor(AccessToken, identity, ttl_seconds)

    
    if at is None:
        try:
            at = AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        except Exception as e:
           
            try:
                at = AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, identity)
            except Exception as e2:
                raise RuntimeError(f"Unable to instantiate AccessToken: {e} / {e2}")

    
    try:
        if hasattr(at, "with_identity"):
            at = at.with_identity(identity)
        elif hasattr(at, "set_identity"):
           
            at.set_identity(identity)
    except Exception:
        
        pass


    try:
        if VideoGrants is not None:
            
            grants_obj = VideoGrants(room_join=True, room=room)
            if hasattr(at, "with_grants"):
                at = at.with_grants(grants_obj)
            else:
                
                try:
                    if hasattr(at, "add_grant"):
                        at.add_grant({"room": room, "roomJoin": True})
                except Exception:
                    
                    pass
        else:
            
            if hasattr(at, "add_grant"):
                try:
                    at.add_grant({"room": room, "roomJoin": True})
                except Exception:
                    pass
    except Exception:
        pass

   
    try:
        if hasattr(at, "with_valid_for"):
            at = at.with_valid_for(ttl_seconds)
        else:
           
            pass
    except Exception:
        pass

    if hasattr(at, "to_jwt"):
        try:
            return at.to_jwt()
        except Exception as e:
            raise RuntimeError(f"Failed to call to_jwt() on AccessToken: {e}")
    else:
        raise RuntimeError("AccessToken object does not expose to_jwt() - cannot produce token")



