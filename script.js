import { launch } from "puppeteer";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join, basename } from "path";

async function distortImage(inputPath, outputPath, options = {}) {
  const browser = await launch();
  const page = await browser.newPage();

  // Read the FisheyeGl library
  const fisheyeCode = readFileSync(
    join(__dirname, "src/fisheyegl.js"),
    "utf8"
  );

  // Create a minimal HTML page with a canvas
  await page.setContent(`
    <html>
      <body>
        <canvas id="canvas"></canvas>
        <script>${fisheyeCode}</script>
      </body>
    </html>
  `);

  // Convert input image to base64
  const imageBuffer = readFileSync(inputPath);
  const base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;

  // Run the distortion
  const result = await page.evaluate(
    ({ base64Image, options }) => {
      return new Promise((resolve) => {
        const fisheye = FisheyeGl({
          image: base64Image,
          lens: {
            a: options.a || 1.0,
            b: options.b || 1.0,
            Fx: options.Fx || 0.0,
            Fy: options.Fy || 0.0,
            scale: options.scale || 1,
          },
        });

        // Wait for the image to process
        setTimeout(() => {
          const output = fisheye.getSrc("image/png");
          resolve(output);
        }, 1);
      });
    },
    { base64Image, options }
  );

  // Save the output image
  const outputData = result.replace(/^data:image\/\w+;base64,/, "");
  const outputBuffer = Buffer.from(outputData, "base64");
  writeFileSync(outputPath, outputBuffer);

  await browser.close();
}

// CLI interface
if (true) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log("Usage:");
    console.log("For single file: node cli.js <input-file> <output-file> [options]");
    console.log("For directory: node cli.js <input-directory> [options]");
    console.log("Options: --a=1.0 --b=1.0 --Fx=0.0 --Fy=0.0 --scale=1.5");
    process.exit(1);
  }

  const [inputPath] = args;
  const options = {};

  // Parse options
  const optionsArgs = args.slice(inputPath.endsWith('.jpg') || inputPath.endsWith('.jpeg') || 
    inputPath.endsWith('.png') || inputPath.endsWith('.gif') ? 2 : 1);
  
  optionsArgs.forEach((arg) => {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      options[key] = parseFloat(value);
    }
  });

  // Check if input is a file or directory
  if (inputPath.endsWith('.jpg') || inputPath.endsWith('.jpeg') || 
      inputPath.endsWith('.png') || inputPath.endsWith('.gif')) {
    // Single file processing
    const outputPath = args[1];
    if (!outputPath) {
      console.log("Error: Output path is required for single file processing");
      process.exit(1);
    }

    // Create output directory if it doesn't exist
    const outputDir = join(outputPath, '..');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    distortImage(inputPath, outputPath, options)
      .then(() => console.log(`Processed: ${basename(inputPath)}`))
      .catch((err) => {
        console.error(`Error processing ${basename(inputPath)}:`, err);
        process.exit(1);
      });
  } else {
    // Directory processing
    const outputDir = join(inputPath, 'output');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir);
    }

    const imageFiles = readdirSync(inputPath).filter(file => 
      /\.(jpg|jpeg|png|gif)$/i.test(file)
    );

    Promise.all(
      imageFiles.map(async (file) => {
        const inputFilePath = join(inputPath, file);
        const outputFilePath = join(outputDir, file);
        try {
          await distortImage(inputFilePath, outputFilePath, options);
          console.log(`Processed: ${file}`);
        } catch (err) {
          console.error(`Error processing ${file}:`, err);
        }
      })
    )
      .then(() => console.log("All images processed successfully!"))
      .catch((err) => {
        console.error("Error processing images:", err);
        process.exit(1);
      });
  }
}

export default { distortImage };
