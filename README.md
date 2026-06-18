# BrowserBenchLLM

BrowserBenchLLM is a browser-based language model benchmarking application. It leverages the power of WebGPU and WebAssembly via `@huggingface/transformers` to run, evaluate, and compare language models entirely locally in your web browser without sending any data to a server.

## Features

- **🤖 Models Management**: Select, download, and manage supported language models directly within your browser.
- **▶ Benchmarking Engine**: Run text summarization and generation tasks against various datasets to test model capabilities.
- **📊 Real-time Dashboard**: Monitor critical metrics during and after inference, including:
  - Load Time (ms)
  - Inference Time (ms)
  - Memory Usage (MB)
  - Output Quality Scores (Coverage, Compression, Coherence, Completeness, Clarity)
- **⚖ Model Comparison**: Compare multiple models side-by-side to evaluate their relative performance and output quality.
- **⚙ Settings & Hardware Acceleration**: Automatic detection and utilization of WebGPU for accelerated inference, seamlessly falling back to WASM when WebGPU is unavailable.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [pnpm](https://pnpm.io/) (or npm/yarn)

### Installation

1. Ensure you are in the project directory.

2. Install the required dependencies:
   ```bash
   pnpm install
   ```

### Running the Application

To start the development server:
```bash
pnpm run dev
```
Then, open your browser and navigate to the local URL provided by Vite (usually `http://localhost:5173`).

### Building for Production

To build the project for production deployment:
```bash
pnpm run build
```

To preview the built project locally:
```bash
pnpm run preview
```

## Technology Stack

- **Framework:** Vanilla TypeScript + HTML/CSS (powered by Vite)
- **ML Engine:** `@huggingface/transformers` (Transformers.js)
- **Hardware Acceleration:** WebGPU, WebAssembly

## Architecture

The application is structured into the following key modules:
- `src/benchmark/`: Core logic for loading models, running inferences, and calculating quality and performance metrics.
- `src/ui/`: UI components for the various application tabs (Models, Runner, Dashboard, Compare, Settings).
- `src/models/`: Configurations and wrappers for the supported Hugging Face models.
- `src/data/`: Benchmark datasets used for evaluation.
