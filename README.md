# NAT-Lytics - Student Academic Performance Prediction System

A full-stack web application for predicting student academic performance using machine learning. Features role-based authentication (Teacher/Admin), session management, SHAP explanations, and data visualizations.

## Features

- 📊 **CSV Upload**: Drag & drop CSV file upload
- 📈 **SHAP Explanations**: Explainable tooltip for individual predictions and batch analysis
- 🎯 **Proficiency Levels**: 5-level classification (Highly Proficient → Not Proficient)
- 👥 **Group Management**: Create groups, add team members, share results
- 📂 **Session Management**: Save and manage multiple analysis sessions
- 📤 **Export**: Download predictions as CSV or PDF reports
- 📱 **Responsive Design**: Works on all devices

## Tech Stack

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
- Supabase account

## Setup Instructions

### 1. Create Environment Variables for backend purposes, supabase not yet implemented

Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
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

| Route | Description |
|-------|-------------|
| `/login` | User login |
| `/signup` | Teacher registration |
| `/home` | Session management dashboard |
| `/groups` | Group management |
| `/dashboard` | Upload data & run predictions |
| `/results` | View prediction results |
| `/manage` | Admin: manage groups & users |
| `/model-evaluation` | View model metrics & feature importance |

## User Roles

- **Teacher**: Can self-register, create sessions, upload data, run predictions
- **Admin**: Pre-created account with full system access, can manage groups

## Expected Data Format

CSV files should contain student records with the following columns:

```csv
studentID,School,age,sex,mother tongue,BMI/nutritional status,Grade 1 Final ratings in Math,...,Grade 5 Final ratings in Math
STU001,School A,12,F,English,Normal,85,...
STU002,School B,13,M,Tagalog,Overweight,72,...
...
```

Required columns depend on the trained model. The default model uses features like:
- Student demographics (age, sex, mother tongue)
- Health status (BMI)
- Previous grade performance (Grades 1 to 5)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/metrics` | Get best model performance metrics |
| GET | `/all-metrics` | All model comparisons |
| GET | `/feature-importance` | Static Feature importance ranking |
| GET | `/proficiency-labels` | Proficiency band definitions |
| POST | `/api/upload` | Upload CSV file |
| POST | `/api/analyze` | Analyze dataset |
| POST | `/explain` | Single prediction with SHAP |
| POST | `/explain-batch` | Batch predictions |

## Development

### Building for Production

```bash
# Frontend build
npm run build
```

### Retraining the Model

The model is pre-trained. To retrain, update dataset at `nat/backend/data/training.csv`:

```bash
cd backend
python train.py
```

This will generate a new `best_model.joblib` file.

## License

MIT