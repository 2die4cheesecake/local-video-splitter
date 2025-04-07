// Initialize FFmpeg
const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({
    log: true,
    progress: ({ ratio }) => {
        const percent = Math.round(ratio * 100);
        document.getElementById('progressBar').style.width = `${percent}%`;
        document.getElementById('progressPercent').textContent = `${percent}%`;
    }
});

// DOM elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileDuration = document.getElementById('fileDuration');
const videoPreview = document.getElementById('videoPreview');
const preview = document.getElementById('preview');
const splitButton = document.getElementById('splitButton');
const progressContainer = document.getElementById('progressContainer');
const results = document.getElementById('results');
const downloadList = document.getElementById('downloadList');
const splitMethodRadios = document.getElementsByName('splitMethod');
const durationOptions = document.getElementById('durationOptions');
const segmentsOptions = document.getElementById('segmentsOptions');
const splitDuration = document.getElementById('splitDuration');
const segmentTime = document.getElementById('segmentTime');
const addSegment = document.getElementById('addSegment');
const segmentList = document.getElementById('segmentList');
const outputFormat = document.getElementById('outputFormat');

// Variables
let videoFile = null;
let videoDuration = 0;
let segments = [];

// Event listeners for drag and drop & file input
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('active');
});
dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('active');
});
dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('active');
    if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
    }
});
fileInput.addEventListener('change', () => {
    if (fileInput.files.length) {
        handleFile(fileInput.files[0]);
    }
});

// Toggle split method options
Array.from(splitMethodRadios).forEach(radio => {
    radio.addEventListener('change', (e) => {
        if (e.target.value === 'duration') {
            durationOptions.classList.remove('hidden');
            segmentsOptions.classList.add('hidden');
        } else {
            durationOptions.classList.add('hidden');
            segmentsOptions.classList.remove('hidden');
        }
    });
});

// Add segment point
addSegment.addEventListener('click', () => {
    const time = parseFloat(segmentTime.value);
    if (!isNaN(time) && time >= 0 && time < videoDuration) {
        if (!segments.includes(time)) {
            segments.push(time);
            segments.sort((a, b) => a - b);
            updateSegmentList();
        }
    }
});

// Split button event listener
splitButton.addEventListener('click', async () => {
    if (!videoFile) return;

    // Disable the button to prevent re-clicking during processing
    splitButton.disabled = true;
    progressContainer.classList.remove('hidden');
    results.classList.add('hidden');
    downloadList.innerHTML = '';

    try {
        // Ensure FFmpeg is loaded before using its filesystem
        if (!ffmpeg.isLoaded()) {
            await ffmpeg.load();
        }

        // Clear previous output files from FFmpeg's filesystem
        const existingFiles = ffmpeg.FS('readdir', '/');
        existingFiles.forEach(file => {
            if (file.startsWith('output')) {
                ffmpeg.FS('unlink', file);
            }
        });

        const method = document.querySelector('input[name="splitMethod"]:checked').value;
        const format = outputFormat.value;
        const inputName = 'input.' + videoFile.name.split('.').pop();
        const outputName = 'output.' + format;

        ffmpeg.FS('writeFile', inputName, await fetchFile(videoFile));

        let command = [];

        if (method === 'duration') {
            const duration = parseFloat(splitDuration.value);
            const totalSegments = Math.ceil(videoDuration / duration);

            let filterComplex = '';
            const outputNames = [];

            // Build trim filters for each segment
            for (let i = 0; i < totalSegments; i++) {
                const start = i * duration;
                const end = (i + 1) * duration;

                filterComplex +=
                    `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${i}];` +
                    `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${i}];`;

                outputNames.push(`-map [v${i}] -map [a${i}] output_${i.toString().padStart(3, '0')}.${format}`);
            }

            // Remove trailing semicolon
            filterComplex = filterComplex.replace(/;+$/, '');

            command = [
                '-i', inputName,
                '-filter_complex', filterComplex,
                ...outputNames.flatMap(o => o.split(' ')),
                '-c:v', 'libx264', '-preset', 'fast',
                '-c:a', 'aac', '-strict', 'experimental'
            ];
        } else {
            if (segments.length === 0) {
                alert('Please add at least one split point');
                splitButton.disabled = false;
                return;
            }

            let filterComplex = '';
            let commandArgs = ['-i', inputName];
            let splitCount = 0;

            // Helper function to add segments
            const addSegment = (start, end) => {
                const vLabel = `v${splitCount}`;
                const aLabel = `a${splitCount}`;
                filterComplex += `[0:v]trim=${start}:${end},setpts=PTS-STARTPTS[${vLabel}];`;
                filterComplex += `[0:a]atrim=${start}:${end},asetpts=PTS-STARTPTS[${aLabel}];`;
                splitCount++;
            };

            if (segments[0] > 0) {
                addSegment(0, segments[0]);
            }
            for (let i = 0; i < segments.length - 1; i++) {
                addSegment(segments[i], segments[i + 1]);
            }
            if (segments[segments.length - 1] < videoDuration) {
                addSegment(segments[segments.length - 1], videoDuration);
            }

            // Remove trailing semicolon
            filterComplex = filterComplex.replace(/;$/, '');

            commandArgs.push('-filter_complex', filterComplex);

            // Map video and audio streams for each segment
            for (let i = 0; i < splitCount; i++) {
                commandArgs.push(
                    '-map', `[v${i}]`,
                    '-map', `[a${i}]`,
                    '-c:v', 'libx264',
                    '-c:a', 'aac',
                    `output_part${i}.${format}`
                );
            }

            command = commandArgs;
        }

        await ffmpeg.run(...command);

        // Get results
        const files = ffmpeg.FS('readdir', '/');
        const outputFiles = files.filter(file => file.startsWith('output') && file !== outputName);

        results.classList.remove('hidden');

        outputFiles.forEach((file, index) => {
            const data = ffmpeg.FS('readFile', file);
            const blob = new Blob([data.buffer], { type: `video/${format}` });
            const url = URL.createObjectURL(blob);

            const card = document.createElement('div');
            card.className = 'bg-gray-100 rounded-lg p-4 flex flex-col';
            card.innerHTML = `
                <div class="flex items-center mb-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 100-2 1 1 0 000 2zm7-1a1 1 0 11-2 0 1 1 0 012 0zm-.464 5.535a1 1 0 10-1.415-1.414 3 3 0 01-4.242 0 1 1 0 00-1.415 1.414 5 5 0 007.072 0z" clip-rule="evenodd" />
                    </svg>
                    <span class="font-medium">Part ${index + 1}</span>
                </div>
                <a href="${url}" download="part_${index + 1}.${format}" class="mt-auto bg-blue-600 hover:bg-blue-700 text-white text-center py-2 px-4 rounded-lg">
                    Download
                </a>
            `;
            downloadList.appendChild(card);
        });

    } catch (error) {
        console.error(error);
        alert('An error occurred while processing the video. Please check the console for details.');
    } finally {
        // Re-enable the split button after processing is complete
        splitButton.disabled = false;
    }
});

// Helper function to handle the selected video file
function handleFile(file) {
    if (!file.type.startsWith('video/')) {
        alert('Please select a video file');
        return;
    }
    videoFile = file;
    fileName.textContent = file.name;
    fileInfo.classList.remove('hidden');

    // Create a video element to get the duration
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
        videoDuration = video.duration;
        fileDuration.textContent = `Duration: ${formatTime(video.duration)}`;

        // Set up preview
        preview.src = URL.createObjectURL(file);
        videoPreview.classList.remove('hidden');

        // Enable the split button
        splitButton.disabled = false;

        // Reset segments and update the list
        segments = [];
        updateSegmentList();

        // Set the max value for segment time input
        segmentTime.max = Math.floor(video.duration);
    };
}

// Helper function to format time (seconds -> MM:SS)
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// Helper function to update the list of split segments
function updateSegmentList() {
    if (segments.length === 0) {
        segmentList.innerHTML = '<p class="text-gray-500 text-sm">No split points added</p>';
        return;
    }
    segmentList.innerHTML = '';
    segments.forEach((time, index) => {
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center py-1 px-2 hover:bg-gray-200 rounded';
        item.innerHTML = `
            <span>${formatTime(time)}</span>
            <button class="text-red-500 hover:text-red-700" data-index="${index}">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
        `;
        segmentList.appendChild(item);
    });

    // Add event listeners to delete buttons for each segment
    segmentList.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', (e) => {
            const index = parseInt(e.target.closest('button').dataset.index);
            segments.splice(index, 1);
            updateSegmentList();
        });
    });
}
