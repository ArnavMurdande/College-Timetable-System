# College Timetable Management System

An intelligent and scalable web application designed to automate the complex process of creating, managing, and viewing academic timetables for educational institutions. This system provides a centralized platform for administrators, faculty, and students to interact with scheduling data seamlessly, eliminating conflicts and manual effort.

## 🌟 Key Features

* **Automated Timetable Generation**: Dynamically creates conflict-free timetables for multiple years, departments, and divisions.
* **Comprehensive Resource Management**:
    * **Faculty & Load**: Manage faculty details, assign teaching loads, and track allocations.
    * **Subjects & Rooms**: Organize subjects, labs, and classrooms efficiently.
* **Role-Based Access Control**: Secure, distinct dashboards and permissions for Admins, Faculty, and Students.
* **Student Elective Choices**: A portal for students to submit their elective subject preferences.
* **Event Scheduling**: Easily schedule workshops, seminars, and other college events without timetable conflicts.
* **Dynamic Timetable Views**: View timetables by class, faculty, or room, with options to export or print.

## 💻 Tech Stack

* **Frontend**: React, Vite, Tailwind CSS, Axios
* **Backend**: Node.js, Express.js
* **Database**: PostgreSQL
* **ORM**: Prisma
* **Authentication**: JWT (JSON Web Tokens), bcrypt for password hashing

---

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

You will need the following software installed on your computer:

* [Node.js](https://nodejs.org/) (v16 or higher)
* [PostgreSQL](https://www.postgresql.org/download/)

### Installation & Setup

1.  **Clone the repository**:
    ```bash
    git clone [https://github.com/your-username/your-repo-name.git](https://github.com/your-username/your-repo-name.git)
    cd your-repo-name
    ```

2.  **Setup the Backend**:
    ```bash
    # Navigate to the server directory
    cd server

    # Install dependencies
    npm install

    # Create the environment file
    # (and add your DATABASE_URL and PORT=5001)
    cp .env.example .env
    ```

3.  **Setup the Database**:
    * Create a PostgreSQL database with the same name you used in your `.env` file.
    * Push the schema to create the database tables:
        ```bash
        npx prisma db push
        ```

4.  **Setup the Frontend**:
    ```bash
    # Navigate to the client directory from the root
    cd ../client

    # Install dependencies
    npm install
    ```

### Running the Application

1.  **Start the Backend Server**:
    * In the `/server` directory, run:
        ```bash
        npm run dev
        ```
    * The server will start on `http://localhost:5001`.

2.  **Start the Frontend Application**:
    * In a **separate terminal**, from the `/client` directory, run:
        ```bash
        npm run dev
        ```
    * The application will open in your browser at `http://localhost:5173`.

---
