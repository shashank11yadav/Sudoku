# Sudoku Solver

## Overview
This project is a web-based Sudoku Solver that allows users to generate and solve Sudoku puzzles. It utilizes HTML, CSS, and JavaScript, along with Bootstrap for styling. The solver employs a backtracking algorithm to find the solution to the given puzzle.

## Features
- **Generate New Puzzle**: Fetches a new Sudoku puzzle from an external API.
- **Solve Puzzle**: Uses a backtracking algorithm to solve the puzzle.
- **Dynamic UI**: A visually appealing Sudoku grid with interactive cells.
- **Color Indications**: Pre-filled numbers are displayed in red, while computed values appear in green.

## Technologies Used
- HTML
- CSS
- JavaScript
- Bootstrap 4
- AJAX (XMLHttpRequest) for API requests

## Project Structure
```
├── index.html      # Main HTML file containing the Sudoku grid
├── style.css       # CSS file for styling the Sudoku grid and buttons
├── script.js       # JavaScript file containing logic for puzzle generation and solving
└── README.md       # Project documentation
```

## Setup and Usage
### Prerequisites
Ensure you have a modern web browser to run the application.

### Steps to Run the Application
1. Clone the repository:
   ```sh
   git clone https://github.com/shashank11yadav/Sudoku.git
   ```
2. Navigate to the project directory:
   ```sh
   cd sudoku
   ```
3. Open `index.html` in a web browser.
4. Click the **"Get New Puzzle"** button to fetch a Sudoku puzzle.
5. Click the **"Solve"** button to compute the solution.

## Code Explanation
### HTML (index.html)
- Defines the Sudoku grid using `div` elements with unique IDs for each cell.
- Includes Bootstrap for UI enhancements.
- Contains buttons to generate and solve puzzles.

### CSS (style.css)
- Styles the Sudoku grid to look like a proper board.
- Uses different colors for pre-filled and computed values.
- Implements hover effects for interactivity.

### JavaScript (script.js)
- Fetches Sudoku puzzles from an external API (`https://sugoku.herokuapp.com/board?difficulty=easy`).
- Implements the **backtracking algorithm** to solve the puzzle recursively.
- Dynamically updates the UI to display the solution.
- Uses `XMLHttpRequest` to handle API calls.

## Future Improvements
- Allow user input to manually edit the board.
- Implement difficulty selection for puzzle generation.
- Add animations for a smoother solving experience.
- Improve error handling for API failures.

Happy Coding! 🎯

