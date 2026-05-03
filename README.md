# NAT-Lytics - Student Academic Performance Prediction System

### Frontend
- React 19 with TypeScript
- Vite for build tooling
- Tailwind CSS 4.x for styling
- Recharts for data visualization
- PapaParse for CSV parsing
- React Router for navigation
- Supabase JS client for authentication
- jsPDF for PDF generation

### Backend
- Flask (Python)
- scikit-learn (Gradient Boosting Regressor)
- SHAP for model explanations
- Pandas for data processing
- NumPy for calculations

## Prerequisites

- Node.js 18+
- Python 3.8+

## Setup Instructions

### 1. Create Environment Variables for backend purposes, supabase not yet implemented

Create a `.env` file in the root directory:

```env
VITE_API_URL=http://localhost:5000
```

### 2. Frontend Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Frontend runs on `http://localhost:5173`

### 3. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate  # On Windows
# source venv/bin/activate  # On Unix

# Install dependencies
pip install -r requirements.txt

# Start Flask server
python app.py
```

Backend runs on `http://localhost:5000`

## Navigation

wip

## User Roles

* Researcher
* School Admin 
* Teacher 

## API Endpoints

wip

## Development

### Building for Production

```bash
# Frontend build
npm run build
```

### Retraining the Model

wip