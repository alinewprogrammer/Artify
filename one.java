import java.util.Scanner;

public class one {
    public static void main(String[] args) {
        // Create a Scanner object to read user input
        Scanner input = new Scanner(System.in);

        // Ask the user for the total count of numbers
        System.out.print("Enter the number of integers to compare: ");
        int count = input.nextInt();

        // Check if there's at least one number to compare
        if (count > 0) {
            // Read the first number and assume it's the smallest initially
            System.out.print("Enter integer 1: ");
            int smallest = input.nextInt();

            // Loop to get the rest of the numbers
            for (int i = 2; i <= count; i++) {
                System.out.print("Enter integer " + i + ": ");
                int currentNumber = input.nextInt();

                // If the new number is smaller, update the 'smallest' variable
                if (currentNumber < smallest) {
                    smallest = currentNumber;
                }
            }

            // Print the final result 🏆
            System.out.println("\nThe smallest integer is: " + smallest);
        } else {
            System.out.println("No integers to compare.");
        }

        // Close the scanner to prevent resource leaks
        input.close();
    }
}