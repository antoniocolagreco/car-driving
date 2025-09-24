# 🚗 Self-Driving Car Simulation

An advanced neural network-powered car racing simulation built with **Astro**, **TypeScript**, and **HTML5 Canvas**. Watch AI-controlled cars learn to drive, avoid traffic, and evolve through genetic algorithms!

## 🎮 [**Live Demo**](https://antoniocolagreco.github.io/car-driving)

![Car Driving Simulation](https://img.shields.io/badge/Status-Live-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![Astro](https://img.shields.io/badge/Astro-FF5D01?logo=astro&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white)

## ✨ Features

### 🧠 **Neural Network & AI**

- **Feed-forward neural networks** with customizable architecture
- **Genetic algorithm** evolution with mutation and selection
- **Real-time learning** and adaptation
- **Network visualization** showing weights and biases
- **Backup/restore** system for best-performing networks

### 🚗 **Realistic Car Physics**

- **Analog controls** with smooth acceleration and steering
- **Realistic brake lights** that activate during braking
- **Physics-based movement** with proper inertia and steering dynamics
- **Collision detection** with traffic and road boundaries
- **Sensor system** with configurable ray casting for obstacle detection

### 📊 **Advanced Scoring System**

- **Multi-factor scoring** based on:
  - 🏁 **Overtakes**: Points for passing traffic cars
  - 🚙 **Smart braking**: Rewards for collision avoidance
  - 🔄 **Intelligent turning**: Points for evasive maneuvers
  - 📏 **Distance traveled**: Progression rewards
- **Real-time statistics** and performance tracking
- **Timeout system** to prevent infinite rounds

### 🎛️ **Interactive Controls**

- **Live configuration** of mutation rates (0-100%)
- **Population size control** (50-500 cars)
- **Neural network architecture** customization
- **Manual network evolution** and restart options
- **Real-time performance monitoring**

### 🎨 **Visual Features**

- **Smooth 60 FPS** canvas rendering
- **Dynamic camera** following the leading car
- **Ghost mode** for inactive cars
- **Winner highlighting** and game over screens
- **Responsive design** that works on all screen sizes

## 🛠️ Technology Stack

- **[Astro](https://astro.build/)** - Modern web framework
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe JavaScript
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[HTML5 Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)** - High-performance graphics
- **[pnpm](https://pnpm.io/)** - Fast, disk space efficient package manager

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20 or higher
- **pnpm** package manager

### Installation

```bash
# Clone the repository
git clone https://github.com/antoniocolagreco/car-driving.git
cd car-driving

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

### Available Scripts

```bash
# Development
pnpm dev          # Start dev server with hot reload
pnpm start        # Alias for dev

# Building
pnpm build        # Build for production
pnpm preview      # Preview production build

# Quality checks
pnpm typecheck    # Run TypeScript checks
pnpm lint         # Run ESLint
pnpm lint:fix     # Fix linting issues
pnpm validate     # Run both typecheck and lint

# Formatting
pnpm format       # Format code with Prettier
pnpm format:check # Check formatting
```

## 🎯 How It Works

### 1. **Neural Network Architecture**

Each car has a neural network that processes:

- **Sensor inputs**: 5 distance sensors detecting obstacles
- **Speed input**: Current velocity
- **Outputs**: Acceleration, braking, and steering decisions

### 2. **Genetic Evolution**

- Cars start with random neural networks
- Best-performing cars are selected based on comprehensive scoring
- Next generation inherits from winners with mutations
- Evolution continues until optimal driving behavior emerges

### 3. **Scoring Algorithm**

Cars are evaluated on multiple criteria:

```typescript
Score = (Overtakes × 40) + (Smart_Braking × 0.5) +
        (Intelligent_Turning × 1) + (Distance × 0.005)
```

### 4. **Collision Avoidance**

- **Ray casting sensors** detect obstacles in multiple directions
- **Smart braking** when obstacles are detected ahead
- **Lane changing** behavior to avoid traffic
- **Timeout system** prevents cars from getting stuck

## 🎮 Controls & Interface

### **Main Controls**

- **🔄 Restart**: Start a new generation
- **💾 Backup**: Save the current best network
- **📁 Restore**: Load previously saved network
- **🗑️ Reset**: Clear saved networks and start fresh
- **⬆️ Evolve**: Manually promote current best car

### **Configuration Panel**

- **Mutation Rate**: Control genetic diversity (0-100%)
- **Car Quantity**: Set population size (50-500 cars)
- **Network Architecture**: Customize hidden layers

### **Information Display**

- **Real-time scoring** breakdown
- **Network performance** metrics
- **Population statistics**
- **FPS counter** and performance data

## 📁 Project Structure

```bash
src/
├── components/          # Reusable UI components
├── constants/           # Application constants and configuration
├── css/                 # Global styles
├── layouts/             # Page layouts
├── libs/                # Utility libraries and algorithms
├── models/              # Core classes (Car, Neural Network, etc.)
└── pages/               # Astro pages
```

## 🔧 Key Classes

- **`NeuralNetwork`**: Feed-forward network with genetic operations
- **`RacingCar`**: AI-controlled car with sensors and scoring
- **`Simulation`**: Main simulation orchestrator
- **`Renderer`**: Canvas rendering and visual effects
- **`UIController`**: Interactive controls and real-time updates
