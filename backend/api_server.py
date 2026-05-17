"""
Flask API server for serving fixed entries via JSON endpoint.

This server provides a read-only API for home automation systems to
access fixed reminder entries with token authentication.
"""

import os
import logging
from datetime import datetime
from functools import wraps

from flask import Flask, jsonify, request
from google.cloud import firestore
from google.oauth2 import service_account

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# Load configuration from environment
API_TOKEN = os.getenv('HUSK_API_TOKEN', '')
FIREBASE_PROJECT_ID = os.getenv('FIREBASE_PROJECT_ID', '')
SERVICE_ACCOUNT_PATH = os.getenv('FIREBASE_SERVICE_ACCOUNT_PATH', '')

if not API_TOKEN:
    logging.warning('HUSK_API_TOKEN not set - API will be disabled')

# Initialize Firestore
db = None
if SERVICE_ACCOUNT_PATH and os.path.exists(SERVICE_ACCOUNT_PATH):
    credentials = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_PATH
    )
    db = firestore.Client(project=FIREBASE_PROJECT_ID, credentials=credentials)
    logging.info(f'Firestore initialized with service account for project {FIREBASE_PROJECT_ID}')
elif FIREBASE_PROJECT_ID:
    # Use Application Default Credentials
    db = firestore.Client(project=FIREBASE_PROJECT_ID)
    logging.info(f'Firestore initialized with ADC for project {FIREBASE_PROJECT_ID}')
else:
    logging.error('Firestore not configured - set FIREBASE_PROJECT_ID')


def require_token(f):
    """Decorator to require valid API token."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not API_TOKEN:
            return jsonify({'error': 'API disabled'}), 503
        
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Missing or invalid Authorization header'}), 401
        
        token = auth_header[7:]  # Remove 'Bearer ' prefix
        if token != API_TOKEN:
            return jsonify({'error': 'Invalid token'}), 401
        
        return f(*args, **kwargs)
    return decorated_function


def serialize_timestamp(ts):
    """Convert Firestore timestamp to ISO 8601 string."""
    if ts is None:
        return None
    if hasattr(ts, 'timestamp'):
        # Firestore timestamp
        return datetime.fromtimestamp(ts.timestamp()).isoformat()
    return str(ts)


def serialize_entry(doc):
    """Serialize a Firestore document to dict."""
    data = doc.to_dict()
    return {
        'id': doc.id,
        'textInput': data.get('textInput', ''),
        'category': data.get('category', 'unknown'),
        'entryType': data.get('entryType', 'regular'),
        'recurrence': data.get('recurrence', {'type': 'none'}),
        'createdAt': serialize_timestamp(data.get('createdAt')),
        'addedByEmail': data.get('addedByEmail', ''),
    }


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        'status': 'ok',
        'timestamp': datetime.utcnow().isoformat(),
        'firestore_configured': db is not None,
        'api_token_configured': bool(API_TOKEN)
    })


@app.route('/api/fixed-entries', methods=['GET'])
@require_token
def get_fixed_entries():
    """Get all fixed entries as JSON.
    
    Requires Authorization: Bearer <token> header.
    
    Returns:
        JSON array of fixed entries with recurrence patterns.
    """
    if db is None:
        return jsonify({'error': 'Firestore not configured'}), 500
    
    try:
        # Query for fixed entries only
        entries_ref = db.collection('entries')
        query = entries_ref.where('entryType', '==', 'fixed').order_by(
            'createdAt', direction=firestore.Query.DESCENDING
        )
        
        docs = query.stream()
        entries = [serialize_entry(doc) for doc in docs]
        
        return jsonify({
            'entries': entries,
            'count': len(entries),
            'timestamp': datetime.utcnow().isoformat()
        })
    except Exception as e:
        logging.error(f'Error fetching fixed entries: {e}')
        return jsonify({'error': 'Failed to fetch entries'}), 500


@app.route('/api/fixed-entries/today', methods=['GET'])
@require_token
def get_todays_fixed_entries():
    """Get fixed entries that match today's date/day.
    
    Filters entries by:
    - Daily recurrence
    - Weekly recurrence matching today's weekday
    - Monthly recurrence matching today's day of month
    - Yearly recurrence matching today's MM-DD
    
    Returns:
        JSON array of matching fixed entries.
    """
    if db is None:
        return jsonify({'error': 'Firestore not configured'}), 500
    
    try:
        now = datetime.now()
        today_weekday = now.weekday()  # 0=Monday, 6=Sunday
        today_day = now.day
        today_mmdd = now.strftime('%m-%d')
        
        # Get all fixed entries (we'll filter client-side since Firestore
        # doesn't support complex OR queries on nested fields)
        entries_ref = db.collection('entries')
        query = entries_ref.where('entryType', '==', 'fixed')
        
        docs = query.stream()
        matching_entries = []
        
        for doc in docs:
            data = doc.to_dict()
            recurrence = data.get('recurrence', {})
            rec_type = recurrence.get('type', 'none')
            
            matches = False
            if rec_type == 'daily':
                matches = True
            elif rec_type == 'weekly':
                days_of_week = recurrence.get('daysOfWeek', [])
                # Convert Monday=0 to Monday=1 for comparison
                if (today_weekday + 1) % 7 in days_of_week or today_weekday in days_of_week:
                    matches = True
            elif rec_type == 'monthly':
                if recurrence.get('dayOfMonth') == today_day:
                    matches = True
            elif rec_type == 'yearly':
                if recurrence.get('date') == today_mmdd:
                    matches = True
            elif rec_type == 'none':
                matches = True  # Include one-time reminders
            
            if matches:
                matching_entries.append(serialize_entry(doc))
        
        return jsonify({
            'entries': matching_entries,
            'count': len(matching_entries),
            'date': now.strftime('%Y-%m-%d'),
            'timestamp': datetime.utcnow().isoformat()
        })
    except Exception as e:
        logging.error(f'Error fetching today\'s fixed entries: {e}')
        return jsonify({'error': 'Failed to fetch entries'}), 500


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
